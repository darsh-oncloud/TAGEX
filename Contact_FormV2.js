/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 *
 * Tagex Brands — Contact Form Suitelet (IFRAME-safe UTM capture + LOUD LOGS)
 *
 * Goals:
 * 1) Capture attribution params passed on the iframe URL (first_landing, referrer, utm_*, gclid/gbraid/wbraid/fbclid, etc.)
 * 2) Survive mobile iframe issues (POST body empty / hidden inputs missing / double GET where second load is blank)
 * 3) NO custom record
 * 4) Remove any on-page textarea/panel that shows session/debug info (no UI debug panel)
 *
 * Approach:
 * - On GET: render HTML form (INLINEHTML) with hidden inputs.
 * - In browser JS: read attribution from iframe URL query string.
 *   - Store in sessionStorage (do NOT overwrite stored values with blanks)
 *   - Repopulate hidden inputs from sessionStorage on every load
 *   - Append attribution to form.action query string so POST can still read from URL even if body is empty
 * - On POST: read from body first, fallback to query string.
 * - Map NEW fields:
 *    first_landing -> custentity_first_landing
 *    referrer      -> custentity_referrer
 * - Keep all other mapping as-is (custentity_utms, gclid/gbraid/wbraid, leadsource, etc.)
 *
 * LOUD LOGS:
 * - Logs every GET/POST hit + all req.parameters + selected headers
 * - Logs final parsed params used to create lead
 *
 * CHANGE REQUESTED:
 * - DO NOT use POST header referer (becomes NetSuite URL).
 * - Instead: on GET, grab header referer (your site) and store it in sessionStorage / hidden field.
 */
define(
  ['N/ui/serverWidget', 'N/record', 'N/url', 'N/runtime', 'N/log', 'N/search', 'N/email'],
  function (serverWidget, record, url, runtime, log, search, email) {

    // ── Config ──────────────────────────────────────────────────────────────────
    var CUSTOM_LEAD_FORM   = 353;
    var EMAIL_AUTHOR_ID    = 297744;
    var NOTIFICATION_EMAIL = 'leads@tagexbrands.com';
    var THANK_YOU_URL      = 'https://www.tagexbrands.com/thank-you-g/';
    var RECAPTCHA_SITE_KEY = '6LflCckaAAAAABsnwQlF0ejFsj2msdlD3QBrh9Ur';
    var LEADSOURCE_PAID    = 5;
    var LEADSOURCE_ORGANIC = 13;

    // Standard defaults applied to every web-form lead (rep can change after).
    var DEFAULT_CATEGORY      = 5;   // Category:       Restaurant
    var DEFAULT_CLIENT_SUBCAT = 56;  // Subcategory:    Independent
    var DEFAULT_CLIENT_CLASS  = 3;   // Classification: C - Sunset (Transactional)

    // Optional: set true to print JSON instead of creating a lead (for testing)
    var TEST_MODE = false;

    // ── Helpers ─────────────────────────────────────────────────────────────────
    function esc(s) {
      s = (s == null ? '' : String(s));
      return s
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#39;');
    }

    function getHeader(req, name) {
      try {
        var h = req.headers || {};
        return h[name] || h[name.toLowerCase()] || h[name.toUpperCase()] || '';
      } catch (e) { return ''; }
    }

    function getParam(req, key) {
      return (req.parameters && req.parameters[key] ? String(req.parameters[key]) : '').trim();
    }

    // Read from POST body key first, then query string key (from form.action URL)
    function getParam2(req, bodyKey, queryKey) {
      return getParam(req, bodyKey) || getParam(req, queryKey);
    }

    function getSuiteletUrl() {
      return url.resolveScript({
        scriptId: runtime.getCurrentScript().id,
        deploymentId: runtime.getCurrentScript().deploymentId,
        returnExternalUrl: true
      });
    }

    function buildUtmString(u) {
      var parts = [];
      if (u.first_landing) parts.push('first_landing=' + u.first_landing);
      if (u.referrer)      parts.push('referrer='      + u.referrer);
      if (u.utm_source)    parts.push('utm_source='    + u.utm_source);
      if (u.utm_medium)    parts.push('utm_medium='    + u.utm_medium);
      if (u.utm_campaign)  parts.push('utm_campaign='  + u.utm_campaign);
      if (u.utm_term)      parts.push('utm_term='      + u.utm_term);
      if (u.utm_content)   parts.push('utm_content='   + u.utm_content);
      if (u.utm_id)        parts.push('utm_id='        + u.utm_id);
      if (u.gclid)         parts.push('gclid='         + u.gclid);
      if (u.gbraid)        parts.push('gbraid='        + u.gbraid);
      if (u.wbraid)        parts.push('wbraid='        + u.wbraid);
      if (u.fbclid)        parts.push('fbclid='        + u.fbclid);
      return parts.join('&');
    }

    // ── Duplicate check ──────────────────────────────────────────────────────────
    function findExistingLead(emailAddr) {
      if (!emailAddr) return null;
      var res = search.create({
        type: 'lead',
        filters: [['email', 'is', emailAddr]],
        columns: ['internalid']
      }).run().getRange({ start: 0, end: 1 });
      return (res && res.length > 0) ? res[0].getValue('internalid') : null;
    }

    // ── Email Notification ───────────────────────────────────────────────────────
    function row(label, value) {
      return '<tr>'
        + '<td style="padding:8px;border:1px solid #ddd;font-weight:bold;">' + esc(label) + '</td>'
        + '<td style="padding:8px;border:1px solid #ddd;">' + esc(value) + '</td>'
        + '</tr>';
    }

    function sendEmail(details, status, leadId, error) {
      var infoBlock = '<table style="border-collapse:collapse;width:100%;max-width:600px;font-family:Arial,sans-serif;font-size:14px;">'
        + row('First Name',      details.firstname  || '-')
        + row('Last Name',       details.lastname   || '-')
        + row('Phone',           details.phone      || '-')
        + row('Email',           details.email      || '-')
        + row('How Can We Help', details.help       || '-')
        + row('Organization',    details.org        || '-')
        + row('Tell Us More',    details.tellUsMore || '-')
        + row('First Landing',   details.firstLanding || '-')
        + row('Referrer',        details.referrer || '-')
        + row('UTM Data',        details.utms       || '-')
        + '</table>';

      var subject, body;
      if (status === 'success') {
        subject = 'New Lead: ' + (details.firstname || '') + ' ' + (details.lastname || '');
        body    = '<p>A new lead has been created in NetSuite.</p>' + infoBlock
                + (leadId ? '<p><b>Lead ID:</b> ' + leadId + '</p>' : '');
      } else if (status === 'duplicate') {
        subject = 'Duplicate Lead: ' + (details.firstname || '') + ' ' + (details.lastname || '');
        body    = '<p>Submission received but a duplicate lead already exists.</p>' + infoBlock
                + (leadId ? '<p><b>Existing Lead ID:</b> ' + leadId + '</p>' : '');
      } else {
        subject = 'Lead Creation FAILED: ' + (details.firstname || '') + ' ' + (details.lastname || '');
        body    = '<p>Error creating lead in NetSuite.</p>' + infoBlock
                + '<p><b>Error:</b> ' + ((error && error.message) ? esc(error.message) : 'Unknown') + '</p>';
      }

      try {
        email.send({
          author: EMAIL_AUTHOR_ID,
          recipients: [NOTIFICATION_EMAIL],
          subject: subject,
          body: body,
          relatedRecords: leadId ? { entityId: leadId } : undefined,
          isInternalOnly: false
        });
      } catch (e) {
        log.error('Email notification failed', e);
      }
    }

    // ── Create Lead ──────────────────────────────────────────────────────────────
    function createLead(params) {
      var firstname   = params.custpage_firstname    || '';
      var lastname    = params.custpage_lastname     || '';
      var emailAddr   = params.custpage_email        || '';
      var org         = params.custpage_organization || '';
      var help        = params.custpage_help         || '';
      var msg         = params.custpage_msg          || '';

      var phone = [
        params.custpage_phone_country,
        params.custpage_phone_area,
        params.custpage_phone_number
      ].filter(Boolean).join('');
      if (params.custpage_phone_ext) phone += params.custpage_phone_ext;

      var companyName = (firstname + ' ' + lastname).trim() || org || 'Unknown';

      // NEW attribution
      var firstLanding = params.custpage_first_landing || '';
      var referrerUrl  = params.custpage_referrer || '';

      // UTMs + click IDs
      var gclid  = params.custpage_gclid  || '';
      var gbraid = params.custpage_gbraid || '';
      var wbraid = params.custpage_wbraid || '';
      var fbclid = params.custpage_fbclid || '';
      var utmString = params.custpage_utms || '';

      // Comments block
      var commentParts = [];
      if (help) commentParts.push('How Can We Help: ' + help);
      if (org)  commentParts.push('Organization: ' + org);
      if (msg)  commentParts.push('Tell Us More: ' + msg);
      var comments = commentParts.join('\n');

      var details = {
        firstname: firstname, lastname: lastname,
        phone: phone, email: emailAddr,
        help: help, org: org, tellUsMore: msg,
        firstLanding: firstLanding,
        referrer: referrerUrl,
        utms: utmString
      };

      // Duplicate check
      var existingId = findExistingLead(emailAddr);
      if (existingId) {
        log.audit('Duplicate lead detected', existingId);
        sendEmail(details, 'duplicate', existingId);
        return { status: 'duplicate', id: existingId };
      }

      // Create lead record
      var lead = record.create({ type: 'lead' });
      lead.setValue({ fieldId: 'customform',  value: CUSTOM_LEAD_FORM });
      lead.setValue({ fieldId: 'companyname', value: companyName });

      if (emailAddr) lead.setValue({ fieldId: 'email', value: emailAddr });

      if (phone) {
        try { lead.setValue({ fieldId: 'phone', value: phone }); }
        catch (e) { log.debug('Phone skipped — invalid format', phone); }
      }

      if (comments) lead.setValue({ fieldId: 'comments', value: comments });

      // Standard defaults on every web-form lead (rep can change after).
      try { lead.setValue({ fieldId: 'category',                       value: DEFAULT_CATEGORY });      } catch (e) { log.debug('Default category skipped', e); }
      try { lead.setValue({ fieldId: 'custentity_ns_tx_client_subcat', value: DEFAULT_CLIENT_SUBCAT }); } catch (e) { log.debug('Default subcategory skipped', e); }
      try { lead.setValue({ fieldId: 'custentity_ns_tx_client_class',  value: DEFAULT_CLIENT_CLASS });  } catch (e) { log.debug('Default classification skipped', e); }

      try { lead.setValue({ fieldId: 'custentity_form_submission_time', value: new Date() }); } catch (e) {}

      // ✅ NEW: Map first landing + referrer
      if (firstLanding) {
        try { lead.setValue({ fieldId: 'custentity_first_landing', value: firstLanding }); } catch (e) {}
      }
      if (referrerUrl) {
        try { lead.setValue({ fieldId: 'custentity_referrer', value: referrerUrl }); } catch (e) {}
      }

      // Lead source + click IDs
      if (gclid || gbraid || wbraid || fbclid) {
        lead.setValue({ fieldId: 'leadsource', value: LEADSOURCE_PAID });
        if (gclid)  { try { lead.setValue({ fieldId: 'custentity_gclid',  value: gclid  }); } catch (e) {} }
        if (gbraid) { try { lead.setValue({ fieldId: 'custentity_gbraid', value: gbraid }); } catch (e) {} }
        if (wbraid) { try { lead.setValue({ fieldId: 'custentity_wbraid', value: wbraid }); } catch (e) {} }
        if (fbclid) { try { lead.setValue({ fieldId: 'custentity_fbclid', value: fbclid }); } catch (e) {} }
      } else {
        lead.setValue({ fieldId: 'leadsource', value: LEADSOURCE_ORGANIC });
      }

      // UTM string on lead
      if (utmString) {
        try { lead.setValue({ fieldId: 'custentity_utms', value: utmString }); } catch (e) {}
      }

      try {
        var id = lead.save({ enableSourcing: true, ignoreMandatoryFields: true });
        log.audit('Lead created', id);
        sendEmail(details, 'success', id);
        return { status: 'success', id: id };
      } catch (e) {
        log.error('Lead creation failed', e);
        sendEmail(details, 'failed', null, e);
        return { status: 'failed', error: e };
      }
    }

    // ── onRequest ────────────────────────────────────────────────────────────────
    function onRequest(context) {
      var req = context.request;
      var res = context.response;

      // LOUD HIT LOG — if you don't see this, Suitelet isn't being reached
      log.audit('SUITELET HIT (RAW)', {
        method: req.method,
        params: req.parameters,
        headers: {
          ua: getHeader(req, 'user-agent'),
          referer: getHeader(req, 'referer'),
          origin: getHeader(req, 'origin'),
          host: getHeader(req, 'host'),
          xff: getHeader(req, 'x-forwarded-for')
        }
      });

      // ── GET ───────────────────────────────────────────────────────────────────
      if (req.method === 'GET') {

        var form = serverWidget.createForm({ title: '&nbsp;' });

        var htmlField = form.addField({
          id: 'custpage_custom_html',
          type: serverWidget.FieldType.INLINEHTML,
          label: 'Form'
        });

        var postActionBase = getSuiteletUrl();

        // ✅ IMPORTANT: capture REAL referrer on GET (your site), not on POST
        var defaultRefFromHeader = (getHeader(req, 'referer') || '').trim();
        // also support common misspelling just in case any proxy uses it
        if (!defaultRefFromHeader) defaultRefFromHeader = (getHeader(req, 'referrer') || '').trim();

        log.audit('GET REFERRER CAPTURE', {
          header_referer: getHeader(req, 'referer'),
          header_referrer: getHeader(req, 'referrer'),
          defaultRefFromHeader: defaultRefFromHeader
        });

        htmlField.defaultValue =
`<style>
  html,body{margin:0!important;padding:0!important;box-sizing:border-box;}
  .form-wrapper{display:flex;justify-content:center;align-items:flex-start;padding:0;margin:0;}
  .form-container{width:100%;max-width:460px;background:#fff;padding:20px 25px;border-radius:10px;position:relative;}
  .form-group{display:flex;flex-direction:column;margin-bottom:12px;}
  .form-group label{margin-bottom:5px;font-weight:bold;font-size:14px;font-family:Arial,sans-serif;}
  .form-group input,
  .form-group select{padding:10px;font-size:14px;border-radius:4px;border:1px solid #ccc;width:100%;height:44px;box-sizing:border-box;font-family:Arial,sans-serif;}
  .form-group textarea{padding:8px;font-size:13px;border-radius:4px;border:1px solid #ccc;width:100%;box-sizing:border-box;resize:vertical;min-height:80px;font-family:Arial,sans-serif;}
  .phone-row{display:flex;gap:8px;flex-wrap:wrap;}
  .hint{display:block;color:#6c757d;font-size:.85em;margin-bottom:4px;}
  button[type=submit]{padding:14px;font-size:14px;border-radius:6px;border:none;background:linear-gradient(135deg,#0b3d91,#072b66);color:#fff;cursor:pointer;width:100%;font-weight:600;font-family:Arial,sans-serif;transition:background .2s,transform .1s;margin-top:8px;}
  button[type=submit]:hover{transform:translateY(-1px);}
  #ns-loader{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:9999;}
  #ns-loader.active{display:block;}
  .spinner{border:8px solid #f3f3f3;border-top:8px solid #3498db;border-radius:50%;width:50px;height:50px;animation:spin 1s linear infinite;position:absolute;top:50%;left:50%;margin:-25px 0 0 -25px;}
  @keyframes spin{to{transform:rotate(360deg);}}
</style>

<script>
/**
 * Persist attribution inside the iframe tab (sessionStorage):
 * - Read from iframe URL query string
 * - Save only if non-blank (never overwrite stored with blanks)
 * - Apply into hidden inputs
 * - Append to form.action query string so server can read even if POST body is empty
 *
 * ✅ Change: if referrer is blank, seed it from GET header referer (real site)
 */
(function(){
  var KEY = 'tagex_attrib_v1';
  var MAX_TRIES = 25;      // ~5s
  var INTERVAL  = 200;

  // ✅ From server GET header (your real page)
  var DEFAULT_REFERRER_FROM_HEADER = ${JSON.stringify(defaultRefFromHeader || '')};

  // Include everything you pass from WP
  var TRACK_KEYS = [
    'first_landing','referrer',
    'utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id',
    'gclid','gbraid','wbraid','fbclid'
  ];

  function parseQS(){
    var out = {};
    try{
      var qs = (window.location.search || '').replace(/^\\\\?/, '');
      if(!qs) return out;
      var parts = qs.split('&');
      for (var i=0;i<parts.length;i++){
        var p = parts[i];
        if(!p) continue;
        var idx = p.indexOf('=');
        var k = idx >= 0 ? p.substring(0, idx) : p;
        var v = idx >= 0 ? p.substring(idx+1) : '';
        k = decodeURIComponent((k || '').replace(/\\\\+/g,' ')).trim();
        v = decodeURIComponent((v || '').replace(/\\\\+/g,' ')).trim();
        if(k) out[k] = v;
      }
    }catch(e){}
    return out;
  }

  function hasAny(obj){
    for (var k in obj){ if (obj.hasOwnProperty(k) && obj[k]) return true; }
    return false;
  }

  function loadStored(){
    try{
      var raw = sessionStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : {};
    }catch(e){ return {}; }
  }

  function saveStored(obj){
    try{ sessionStorage.setItem(KEY, JSON.stringify(obj)); }catch(e){}
  }

  function mergeKeepExisting(oldObj, newObj){
    // overwrite only if new value is non-blank
    var out = {};
    var k;
    oldObj = oldObj || {};
    newObj = newObj || {};
    for (k in oldObj){ if (oldObj.hasOwnProperty(k)) out[k] = oldObj[k] || ''; }
    for (k in newObj){ if (newObj.hasOwnProperty(k) && newObj[k]) out[k] = newObj[k]; }
    return out;
  }

  function setHidden(name, val){
    var el = document.querySelector('input[name="'+name+'"]');
    if (el) el.value = val || '';
  }

  function buildUtmString(o){
    var parts = [];
    function add(k){
      if (o[k]) parts.push(k + '=' + o[k]);
    }
    for (var i=0;i<TRACK_KEYS.length;i++) add(TRACK_KEYS[i]);
    return parts.join('&');
  }

  function cleanAction(urlStr){
    // strip old attrib from action
    var re = new RegExp('([?&])(' + TRACK_KEYS.join('|') + '|utms)=[^&]*', 'g');
    return (urlStr || '').replace(re, '$1').replace(/[?&]$/,'');
  }

  function addToAction(form, obj){
    try{
      var base = cleanAction(form.action || window.location.href);
      var glue = base.indexOf('?') >= 0 ? '&' : '?';
      var qs = [];
      function enc(x){ return encodeURIComponent(x || ''); }
      for (var i=0;i<TRACK_KEYS.length;i++){
        var k = TRACK_KEYS[i];
        if (obj[k]) qs.push(k + '=' + enc(obj[k]));
      }
      var utms = buildUtmString(obj);
      if (utms) qs.push('utms=' + enc(utms));
      if (qs.length) form.action = base + glue + qs.join('&');
    }catch(e){}
  }

  function applyAll(obj){
    // Hidden fields
    setHidden('custpage_first_landing', obj.first_landing || '');
    setHidden('custpage_referrer',      obj.referrer      || '');
    setHidden('custpage_utm_source',    obj.utm_source    || '');
    setHidden('custpage_utm_medium',    obj.utm_medium    || '');
    setHidden('custpage_utm_campaign',  obj.utm_campaign  || '');
    setHidden('custpage_utm_term',      obj.utm_term      || '');
    setHidden('custpage_utm_content',   obj.utm_content   || '');
    setHidden('custpage_utm_id',        obj.utm_id        || '');
    setHidden('custpage_gclid',         obj.gclid         || '');
    setHidden('custpage_gbraid',        obj.gbraid        || '');
    setHidden('custpage_wbraid',        obj.wbraid        || '');
    setHidden('custpage_fbclid',        obj.fbclid        || '');
    setHidden('custpage_utms',          buildUtmString(obj));

    var f = document.forms && document.forms[0];
    if (f){
      f.method = 'POST';
      addToAction(f, obj);
    }
  }

  // Set base action first (no attrib) so we control exactly what gets appended
  try{
    var f0 = document.forms && document.forms[0];
    if (f0){
      f0.method = 'POST';
      f0.action = ${JSON.stringify(postActionBase)};
    }
  }catch(e){}

  var tries = 0;
  function tick(){
    tries++;

    var stored = loadStored();
    var q = parseQS();

    // Extract only tracked keys from URL
    var fromUrl = {};
    for (var i=0;i<TRACK_KEYS.length;i++){
      var k = TRACK_KEYS[i];
      fromUrl[k] = q[k] || '';
    }

    // ✅ Seed referrer ONLY if blank everywhere, using GET header referer
    if (!fromUrl.referrer && !stored.referrer && DEFAULT_REFERRER_FROM_HEADER) {
      fromUrl.referrer = DEFAULT_REFERRER_FROM_HEADER;
    }

    var finalObj = stored;

    // Only store/update if URL actually has any values
    if (hasAny(fromUrl)) {
      finalObj = mergeKeepExisting(stored, fromUrl);
      saveStored(finalObj);
    } else if (hasAny(stored)) {
      finalObj = stored;
    }

    applyAll(finalObj);

    // Keep trying briefly if we still have nothing (mobile timing)
    if (hasAny(finalObj) || tries >= MAX_TRIES) return;
    setTimeout(tick, INTERVAL);
  }

  tick();
})();
</script>

<div class="form-wrapper">
  <div class="form-container">

    <!-- Hidden attribution fields (filled by JS from URL/sessionStorage) -->
    <input type="hidden" name="custpage_first_landing" value="">
    <input type="hidden" name="custpage_referrer" value="">
    <input type="hidden" name="custpage_utm_source" value="">
    <input type="hidden" name="custpage_utm_medium" value="">
    <input type="hidden" name="custpage_utm_campaign" value="">
    <input type="hidden" name="custpage_utm_term" value="">
    <input type="hidden" name="custpage_utm_content" value="">
    <input type="hidden" name="custpage_utm_id" value="">
    <input type="hidden" name="custpage_gclid" value="">
    <input type="hidden" name="custpage_gbraid" value="">
    <input type="hidden" name="custpage_wbraid" value="">
    <input type="hidden" name="custpage_fbclid" value="">
    <input type="hidden" name="custpage_utms" value="">

    <div class="form-group">
      <label>First Name *</label>
      <input type="text" name="custpage_firstname" required autocomplete="given-name">
    </div>

    <div class="form-group">
      <label>Last Name *</label>
      <input type="text" name="custpage_lastname" required autocomplete="family-name">
    </div>

    <div class="form-group">
      <label>Email *</label>
      <input type="email" name="custpage_email" required autocomplete="email">
    </div>

    <div class="form-group">
      <label>Phone *</label>
      <div class="phone-row">
        <input type="tel" name="custpage_phone_country" placeholder="+1" maxlength="4" value="+1" required style="width:60px;">
        <input type="tel" name="custpage_phone_area" placeholder="Area" maxlength="5" style="width:70px;">
        <input type="tel" name="custpage_phone_number" placeholder="1234567" maxlength="10" required style="flex:1;">
        <input type="tel" name="custpage_phone_ext" placeholder="Ext" maxlength="6" style="width:75px;">
      </div>
    </div>

    <div class="form-group">
      <label>How Can We Help? *</label>
      <select name="custpage_help" required>
        <option value="">Select...</option>
        <option value="Buy from TAGeX">Buy from TAGeX</option>
        <option value="Sell or Liquidate Equipment">Sell or Liquidate Equipment</option>
        <option value="Facility Services">Facility Services</option>
        <option value="Asset Management">Asset Management</option>
        <option value="Other">Other</option>
      </select>
    </div>

    <div class="form-group">
      <label>Organization *</label>
      <input type="text" name="custpage_organization" required autocomplete="organization">
    </div>

    <div class="form-group">
      <label>Tell Us More</label>
      <span class="hint">Best time to contact you, preferred contact method, or any other details.</span>
      <textarea name="custpage_msg"></textarea>
    </div>

    <div class="g-recaptcha" data-sitekey="${RECAPTCHA_SITE_KEY}" style="margin-bottom:10px;"></div>

    <button type="submit">Submit</button>

    <div id="ns-loader"><div class="spinner"></div></div>
  </div>
</div>

<script>
document.addEventListener('submit', function(){
  var l = document.getElementById('ns-loader');
  if(l) l.className = 'active';
}, true);
</script>

<script src="https://www.google.com/recaptcha/api.js" async defer></script>`;

        res.writePage(form);
        return;
      }

      // ── POST ──────────────────────────────────────────────────────────────────
      if (req.method === 'POST') {

        // Body first, then query string (action URL)
        var params = {
          // Form fields
          custpage_firstname:     getParam(req, 'custpage_firstname'),
          custpage_lastname:      getParam(req, 'custpage_lastname'),
          custpage_email:         getParam(req, 'custpage_email'),
          custpage_phone_country: getParam(req, 'custpage_phone_country'),
          custpage_phone_area:    getParam(req, 'custpage_phone_area'),
          custpage_phone_number:  getParam(req, 'custpage_phone_number'),
          custpage_phone_ext:     getParam(req, 'custpage_phone_ext'),
          custpage_help:          getParam(req, 'custpage_help'),
          custpage_organization:  getParam(req, 'custpage_organization'),
          custpage_msg:           getParam(req, 'custpage_msg'),

          // Attribution (NEW + existing)
          custpage_first_landing: getParam2(req, 'custpage_first_landing', 'first_landing'),

          // ✅ IMPORTANT: referrer comes ONLY from hidden/query (NOT from POST header)
          custpage_referrer:      getParam2(req, 'custpage_referrer', 'referrer'),

          custpage_utm_source:    getParam2(req, 'custpage_utm_source',   'utm_source'),
          custpage_utm_medium:    getParam2(req, 'custpage_utm_medium',   'utm_medium'),
          custpage_utm_campaign:  getParam2(req, 'custpage_utm_campaign', 'utm_campaign'),
          custpage_utm_term:      getParam2(req, 'custpage_utm_term',     'utm_term'),
          custpage_utm_content:   getParam2(req, 'custpage_utm_content',  'utm_content'),
          custpage_utm_id:        getParam2(req, 'custpage_utm_id',       'utm_id'),

          custpage_gclid:         getParam2(req, 'custpage_gclid',        'gclid'),
          custpage_gbraid:        getParam2(req, 'custpage_gbraid',       'gbraid'),
          custpage_wbraid:        getParam2(req, 'custpage_wbraid',       'wbraid'),
          custpage_fbclid:        getParam2(req, 'custpage_fbclid',       'fbclid'),

          custpage_utms:          getParam2(req, 'custpage_utms',         'utms')
        };

        // If utms missing but individual fields exist, rebuild
        if (!params.custpage_utms) {
          params.custpage_utms = buildUtmString({
            first_landing: params.custpage_first_landing,
            referrer: params.custpage_referrer,
            utm_source: params.custpage_utm_source,
            utm_medium: params.custpage_utm_medium,
            utm_campaign: params.custpage_utm_campaign,
            utm_term: params.custpage_utm_term,
            utm_content: params.custpage_utm_content,
            utm_id: params.custpage_utm_id,
            gclid: params.custpage_gclid,
            gbraid: params.custpage_gbraid,
            wbraid: params.custpage_wbraid,
            fbclid: params.custpage_fbclid
          });
        }

        // Loud final param log
        log.audit('POST (FINAL PARSED PARAMS)', params);

        if (TEST_MODE) {
          res.write('<pre style="white-space:pre-wrap;font-family:monospace;">' + esc(JSON.stringify(params, null, 2)) + '</pre>');
          return;
        }

        try {
          var result = createLead(params);
          log.audit('Lead result', result);
        } catch (e) {
          log.error('Lead creation exception', e);
        }

        // Redirect to thank-you page (top/parent safe)
        var redirectHtml = '<!doctype html><html><head><meta charset="utf-8">'
          + '<meta name="viewport" content="width=device-width,initial-scale=1">'
          + '<title>Redirecting...</title></head><body>'
          + '<script>(function(){'
          + 'var u=' + JSON.stringify(THANK_YOU_URL) + ';'
          + 'try{if(window.top){window.top.location.href=u;return;}}catch(e){}'
          + 'try{if(window.parent){window.parent.location.href=u;return;}}catch(e){}'
          + 'window.location.href=u;'
          + '})()</s' + 'cript>'
          + '<noscript><a href="' + esc(THANK_YOU_URL) + '">Continue &rarr;</a></noscript>'
          + '</body></html>';

        res.write(redirectHtml);
        return;
      }
    }

    return { onRequest: onRequest };
  }
);
