/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/ui/serverWidget', 'N/record', 'N/url', 'N/runtime', 'N/log', 'N/search', 'N/email', 'N/redirect'],
  (serverWidget, record, url, runtime, log, search, email, redirect) => {

    const customLeadForm = 353;


    function getHeader(req, name) {
  try {
    var h = req.headers || {};
    var v = h[name] || h[name.toLowerCase()] || h[name.toUpperCase()];
    return v || '';
  } catch (e) { return ''; }
}

function logDevice(req, stage) {
  var ua = getHeader(req, 'user-agent');
  var referer = getHeader(req, 'referer');
  var origin = getHeader(req, 'origin');
  var ip = getHeader(req, 'x-forwarded-for') || getHeader(req, 'client-ip'); // may be blank
  log.audit('SL Device Info - ' + stage, {
    method: req.method,
    userAgent: ua,
    referer: referer,
    origin: origin,
    ip: ip
  });
}

    function esc(s) {
      s = (s == null ? '' : String(s));
      return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function slUrl(extra) {
      var u = url.resolveScript({
        scriptId: runtime.getCurrentScript().id,
        deploymentId: runtime.getCurrentScript().deploymentId,
        returnExternalUrl: true
      });
      if (extra) u += (u.indexOf('?') === -1 ? '?' : '&') + extra;
      return u;
    }

    function getAllParams(request) {
      var parts = [];
      for (var key in request.parameters) {
        if (request.parameters.hasOwnProperty(key)) {
          var value = request.parameters[key] || '';
          parts.push(key + ': ' + value);
        }
      }
      return parts.join('&');
    }

    function parsePayloadBG(request) {
      try { if (request.body) return JSON.parse(request.body); } catch (e) { }
      return Object.assign({}, request.parameters);
    }

    // === Create Lead exactly like your MR logic ===
    function createLeadLikeMR(p) {
      // Build phone (country + area + number [+ ext])
      var phone = [
        (p.custpage_phone_country || '').trim(),
        (p.custpage_phone_area || '').trim(),
        (p.custpage_phone_number || '').trim()
      ].filter(Boolean).join('');
      if (p.custpage_phone_ext) phone += String(p.custpage_phone_ext).trim();

      // Company name: "First Last" or Organization or 'Unknown'
      var firstname = p.custpage_firstname || '';
      var lastname = p.custpage_lastname || '';
      var org = p.custpage_organization || '';
      var companyName = (firstname + ' ' + lastname).trim() || org || 'Unknown';

      // Comments textarea value from parts (same as your MR)
      var parts = [];
      if (p.custpage_help) parts.push('How Can We Help: ' + p.custpage_help);
      if (org) parts.push('Organization: ' + org);
      if (p.custpage_msg) parts.push('Tell Us More: ' + p.custpage_msg);
      var comments = parts.join('\n');

      var gclid = p.custpage_gclid_utms || '';
      var gbraid = p.custpage_gbraid_utms || '';
      var wbraid = p.custpage_wbraid_utms || '';
      var utms = p.custpage_utms || '';
      var emailAddr = (p.custpage_email || '').trim();
      var tellUsMore = p.custpage_msg || '';

      var details = {
        firstname: firstname,
        lastname: lastname,
        phone: phone,
        email: emailAddr,
        help: p.custpage_help || '',
        tellUsMore: tellUsMore,
        utms: utms,
        org: org
      };

      var existingId = null;
      if (emailAddr) {
        var dupSearch = search.create({
          type: 'lead',
          filters: [['email', 'is', emailAddr]],
          columns: ['internalid']
        }).run().getRange({ start: 0, end: 1 });

        if (dupSearch && dupSearch.length > 0) {
          existingId = dupSearch[0].getValue('internalid');
        }
      }

      // --- If duplicate lead found ---
      if (existingId) {
        log.audit('Duplicate lead detected', existingId);
        sendEmailNotification(details, 'duplicate', existingId);
        return { status: 'duplicate', id: existingId };
      }

      // Create the lead
      var lead = record.create({ type: 'lead' });
      lead.setValue({ fieldId: 'customform', value: customLeadForm });
      lead.setValue({ fieldId: 'companyname', value: companyName });
      if (emailAddr) lead.setValue({ fieldId: 'email', value: emailAddr });

      try {
        if (phone) lead.setValue({ fieldId: 'phone', value: phone });
      } catch (err) {
        log.debug('Invalid phone skipped', phone);
        log.debug('Invalid phone error', err);
      }

      if (comments) lead.setValue({ fieldId: 'comments', value: comments });

      // Custom timestamp like your MR
      try { lead.setValue({ fieldId: 'custentity_form_submission_time', value: new Date() }); } catch (e) { }

      // Lead source + tracking (same IDs as your MR)
      if (gclid) {
        lead.setValue({ fieldId: 'leadsource', value: 5 });
        lead.setValue({ fieldId: 'custentity_gclid', value: gclid });
        lead.setValue({ fieldId: 'custentity_utms', value: utms });
      } else {
        lead.setValue({ fieldId: 'leadsource', value: 13 });
        lead.setValue({ fieldId: 'custentity_utms', value: utms });
      }

      if (gbraid) lead.setValue({ fieldId: 'custentity_gbraid', value: gbraid });
      if (wbraid) lead.setValue({ fieldId: 'custentity_wbraid', value: wbraid });

      try {
        var id = lead.save({ enableSourcing: true, ignoreMandatoryFields: true });
        log.debug('Lead created successfully', id);
        sendEmailNotification(details, 'success', id);
        return { status: 'success', id: id };
      } catch (e) {
        log.error('Lead creation failed', e);
        sendEmailNotification(details, 'failed', null, e);
        return { status: 'failed', error: e };
      }
    }

    function sendEmailNotification(details, status, leadId, error) {
      var subject = '';
      var body = '';

      var infoBlock = `
<table style="border-collapse: collapse; width: 100%; max-width: 600px;">
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>First Name:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${details.firstname || '-'}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Last Name:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${details.lastname || '-'}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Phone Number:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${details.phone || '-'}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Email:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${details.email || '-'}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>How Can We Help:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${details.help || '-'}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Organization:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${details.org || '-'}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Tell Us More</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${details.tellUsMore || '-'}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>UTMs</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${details.utms || '-'}</td></tr>
</table>`;

      if (status === 'success') {
        subject = `New Lead Created: ${details.firstname} ${details.lastname}`;
        body = `<p>A new lead has been created successfully in NetSuite.</p>${infoBlock}${leadId ? `<p><strong>Lead ID:</strong> ${leadId}</p>` : ''}`;
      } else if (status === 'duplicate') {
        subject = `Duplicate Lead Detected: ${details.firstname} ${details.lastname}`;
        body = `<p>A lead submission was attempted, but a duplicate already exists in NetSuite.</p>${infoBlock}${leadId ? `<p><strong>Existing Lead ID:</strong> ${leadId}</p>` : ''}`;
      } else {
        subject = `Lead Creation Failed: ${details.firstname} ${details.lastname}`;
        body = `<p>There was an error creating a lead in NetSuite.</p>${infoBlock}<p><strong>Error Details:</strong> ${(error && error.message) ? esc(error.message) : 'Unknown error'}</p>`;
      }

      try {
        email.send({
          author: 297744,
          recipients: ['leads@tagexbrands.com'],
          subject: subject,
          body: body,
          relatedRecords: leadId ? { entityId: leadId } : undefined,
          isInternalOnly: false
        });
        log.audit('Email sent', subject);
      } catch (mailErr) {
        log.error('Email send failed', mailErr);
      }
    }

    function onRequest(context) {
      var req = context.request;
      var res = context.response;

      // BG mode (kept for compatibility, but POST server-side lead creation is what matters)
      if ((req.parameters.mode || '') === 'bg') {
        try {
          var p = parsePayloadBG(req);
          createLeadLikeMR(p);
          res.setHeader({ name: 'Content-Type', value: 'text/plain; charset=utf-8' });
          res.write('OK');
        } catch (e) {
          log.error('Lead create failed (bg)', e);
          res.setHeader({ name: 'Content-Type', value: 'text/plain; charset=utf-8' });
          res.write('ERR');
        }
        return;
      }

      if (req.method === 'GET') {
        var form = serverWidget.createForm({ title: '&nbsp;' });
        logDevice(req, 'GET');

        // These can be empty on mobile due to privacy stripping; we'll capture on client too.
        var utmString = req.parameters.fullURL ? req.parameters.fullURL : getAllParams(req);
        var gclid = req.parameters.gclid || '';
        var gbraid = req.parameters.gbraid || '';
        var wbraid = req.parameters.wbraid || '';
        log.debug('GET Params', {gclid, gbraid, wbraid, utmString})

        // Optional serverWidget hidden fields (not relied on)
        var fUtms = form.addField({ id: 'custpage_utms', type: serverWidget.FieldType.LONGTEXT, label: 'UTMs' });
        fUtms.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        fUtms.defaultValue = utmString;

        var fGclid = form.addField({ id: 'custpage_gclid_utms', type: serverWidget.FieldType.TEXT, label: 'GCLID' });
        fGclid.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        fGclid.defaultValue = gclid;

        var fGbraid = form.addField({ id: 'custpage_gbraid_utms', type: serverWidget.FieldType.TEXT, label: 'GBRAID' });
        fGbraid.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        fGbraid.defaultValue = gbraid;

        var fWbraid = form.addField({ id: 'custpage_wbraid_utms', type: serverWidget.FieldType.TEXT, label: 'WBRAID' });
        fWbraid.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        fWbraid.defaultValue = wbraid;

        var htmlField = form.addField({
          id: 'custpage_custom_html',
          type: serverWidget.FieldType.INLINEHTML,
          label: 'Custom Form'
        });

        var siteKey = '6LflCckaAAAAABsnwQlF0ejFsj2msdlD3QBrh9Ur';
        var postAction = esc(slUrl('')); // explicit action helps in-app browsers

        htmlField.defaultValue = `
<style>
  html, body { margin: 0 !important; padding: 0 !important; min-height: 100vh; box-sizing: border-box; }
  .form-wrapper { display:flex; justify-content:center; align-items: flex-start; padding:0; margin: 0; box-sizing:border-box; }
  .contact-form-container { width:100%; max-width:450px; background:#fff; padding:20px 25px; border-radius:10px; position:relative; }
  .contact-form { display:flex; flex-direction:column; font-size: 13px; }
  .contact-form .form-group:first-child { margin-top: 0; }
  .form-group { display:flex; flex-direction:column; margin-bottom:12px; width:100%; }
  .form-group label { margin-bottom:5px; font-weight:bold; font-size: 14px; }
  .form-group input, .form-group select {
    padding:10px; font-size:14px; border-radius:4px; border:1px solid #ccc; width:100%; height:44px; box-sizing:border-box;
  }
  .form-group textarea {
    padding:8px; font-size:13px; border-radius:4px; width:100%; box-sizing:border-box; resize: vertical; min-height:80px;
  }
  .spinner {
    border:8px solid #f3f3f3; border-top:8px solid #3498db; border-radius: 50%;
    width:50px; height:50px; animation: spin 1s linear infinite;
    position:absolute; top:50%; left:50%; margin-top:-25px; margin-left:-25px;
  }
  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  .loader-hidden { display:none; }
  .loader-visible {
    display:block; position:fixed; top:0; left:0; width:100%; height:100%;
    background-color: rgba(0,0,0,0.5); z-index: 9999;
  }
  button {
    padding:14px; font-size:14px; border-radius:6px; border:none;
    background: linear-gradient(135deg,#0b3d91,#072b66); color:#fff; cursor:pointer; width:100%;
    text-align:center; font-weight:600; transition: background .2s ease-in-out, transform .1s;
  }
  button:hover { background: linear-gradient(135deg,#0a357d,#051f4d); transform: translateY(-1px); }
  button:active { transform: translateY(1px); }
</style>

<script>
  try { gtag('event', 'conversion', {'send_to': 'AW-957692643/Yfx5CJO4w-kCEOP11MgD'}); } catch(e) {}
</script>

<div class="form-wrapper">
  <div class="contact-form-container">
    <form method="POST" action="${postAction}" class="contact-form" id="leadform">

      <!-- ALWAYS POST these (mobile-safe) -->
      <input type="hidden" name="custpage_gclid_utms" id="custpage_gclid_utms" value="${esc(gclid)}">
      <input type="hidden" name="custpage_gbraid_utms" id="custpage_gbraid_utms" value="${esc(gbraid)}">
      <input type="hidden" name="custpage_wbraid_utms" id="custpage_wbraid_utms" value="${esc(wbraid)}">
      <textarea name="custpage_utms" id="custpage_utms" style="display:none;">${esc(utmString)}</textarea>

      <div class="form-group">
        <label>First Name *</label>
        <input type="text" name="custpage_firstname" required>
      </div>

      <div class="form-group">
        <label>Last Name *</label>
        <input type="text" name="custpage_lastname" required>
      </div>

      <div class="form-group">
        <label>Email *</label>
        <input type="email" name="custpage_email" required>
      </div>

      <div class="form-group">
        <label>Phone *</label>
        <div style="display:flex; gap: 8px; flex-wrap: wrap;">
          <input type="tel" id="custpage_phone_country" name="custpage_phone_country" placeholder="+1" maxlength="4"
            value="+1" pattern="^\\+?[0-9]{1,3}$" required style="width: 60px;" />
          <input type="tel" id="custpage_phone_area" name="custpage_phone_area" placeholder="Area" maxlength="5"
            required pattern="^[0-9]{2,5}$" style="width: 70px;" />
          <input type="tel" id="custpage_phone_number" name="custpage_phone_number" placeholder="1234567" maxlength="10"
            pattern="^[0-9]{5,10}$" required style="flex: 1;" />
          <input type="tel" id="custpage_phone_ext" name="custpage_phone_ext" placeholder="Ext" maxlength="6" style="width: 80px;" />
        </div>
      </div>

      <div class="form-group">
        <label>How Can We Help? *</label>
        <select name="custpage_help" required>
          <option value="">Select</option>
          <option value="Closure Support (Facilities and Restaurants)">Closure Support (Facilities and Restaurants)</option>
          <option value="Surplus Liquidation">Surplus Liquidation</option>
          <option value="Asset (Equipment) Storage Redeployment">Asset (Equipment) Storage Redeployment</option>
          <option value="Clean Sweep (Pick up Equipment in Multiple Locations)">Clean Sweep (Pick up Equipment in Multiple Locations)</option>
          <option value="Buy Direct From Us">Buy Direct From Us</option>
          <option value="Data Management">Data Management</option>
          <option value="Other">Other</option>
        </select>
      </div>

      <div class="form-group">
        <label>Organization *</label>
        <input type="text" name="custpage_organization" required>
      </div>

      <div class="form-group">
        <label for="custpage_msg">Tell Us More</label>
        <small style="display:block; color:#6c757d; font-size:0.9em;">
          For example: Best time to contact you, preferred contact method, or any other relevant details.
        </small>
        <textarea name="custpage_msg" id="custpage_msg"></textarea>
      </div>

      <div class="g-recaptcha" data-sitekey="${siteKey}"></div>

      <button type="submit">Submit</button>
      <div class="loader-hidden" id="loader"><div class="spinner"></div></div>
    </form>
  </div>
</div>

<!-- Mobile/in-app browser SAFE capture:
     reads the *real* URL on the device and overwrites hidden fields before submit -->
<script>
(function(){
  function getEl(id){ return document.getElementById(id); }
  function setValIfEmpty(id, v){
    var el = getEl(id);
    if (!el) return;
    var cur = (el.value || '').trim();
    if (!cur && v) el.value = v;
  }
  function setVal(id, v){
    var el = getEl(id);
    if (el) el.value = v || '';
  }

  function fillTracking(){
    try{
      var href = window.location.href || '';
      var u = new URL(href);

      // These 3 come from the Suitelet URL on the device (OK)
      var gclid  = (u.searchParams.get('gclid')  || '').trim();
      var gbraid = (u.searchParams.get('gbraid') || '').trim();
      var wbraid = (u.searchParams.get('wbraid') || '').trim();

      // ✅ only set if empty (do NOT overwrite if GET already populated)
      setValIfEmpty('custpage_gclid_utms', gclid);
      setValIfEmpty('custpage_gbraid_utms', gbraid);
      setValIfEmpty('custpage_wbraid_utms', wbraid);

      // ✅ UTMs: DO NOT replace with NetSuite URL.
      // If GET didn't populate it, fallback to referrer first (often tagex page), else keep as-is.
      var ref = (document.referrer || '').trim();
      if (ref) setValIfEmpty('custpage_utms', ref);

      // If still empty (rare), then fallback to href (NetSuite URL)
      setValIfEmpty('custpage_utms', href);

    }catch(e){}
  }

  fillTracking();
  var f = getEl('leadform');
  if (f) f.addEventListener('submit', fillTracking, true);
})();

console.log('cookies', window.parent.document.cookie);

</script>

<script src="https://www.google.com/recaptcha/api.js" async defer></script>
`;

        res.writePage(form);
        return;
      }

      if (req.method === 'POST') {
        log.debug('req.parameters', req.parameters);
        logDevice(req, 'POST');

        var payload = {
          custpage_firstname: req.parameters.custpage_firstname || '',
          custpage_lastname: req.parameters.custpage_lastname || '',
          custpage_email: req.parameters.custpage_email || '',
          custpage_phone_country: req.parameters.custpage_phone_country || '',
          custpage_phone_area: req.parameters.custpage_phone_area || '',
          custpage_phone_number: req.parameters.custpage_phone_number || '',
          custpage_phone_ext: req.parameters.custpage_phone_ext || '',
          custpage_help: req.parameters.custpage_help || '',
          custpage_organization: req.parameters.custpage_organization || '',
          custpage_msg: req.parameters.custpage_msg || '',
          custpage_gclid_utms: req.parameters.custpage_gclid_utms || '',
          custpage_gbraid_utms: req.parameters.custpage_gbraid_utms || '',
          custpage_wbraid_utms: req.parameters.custpage_wbraid_utms || '',
          custpage_utms: req.parameters.custpage_utms || ''
        };

        log.debug('payload in POST', payload);

        // ✅ Create lead on server (best reliability)
        try {
          var result = createLeadLikeMR(payload);
          log.audit('Lead create result', result);
        } catch (e) {
          log.error('Lead create failed in POST', e);
        }

        var shouldRedirect = (payload.custpage_utms || '').indexOf('https://www.tagexbrands.com/') !== -1;

        if (shouldRedirect) {
        //  redirect.redirect({ url: 'https://www.tagexbrands.com/thank-you-g/' });

            var target = 'https://www.tagexbrands.com/thank-you-g/';

  var html = ''
    + '<!doctype html><html><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>Redirecting...</title></head><body>'
    + '<script>'
    + '(function(){'
    + 'var u=' + JSON.stringify(target) + ';'
    + 'try{ if(window.top){ window.top.location.href=u; return; } }catch(e){}'
    + 'try{ if(window.parent){ window.parent.location.href=u; return; } }catch(e){}'
    + 'window.location.href=u;'
    + '})();'
    + '</script>'
    + '<noscript><a href="' + esc(target) + '">Continue</a></noscript>'
    + '</body></html>';

  res.write(html);
  return;
        }

        res.write('<!doctype html><meta charset="utf-8"><h3 style="color:green;text-align:center;margin-top:50px;">Thanks for contacting us! We will get back to you soon.</h3>');
        return;
      }
    }

    return { onRequest };
  });