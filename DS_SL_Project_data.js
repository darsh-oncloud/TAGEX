/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/ui/serverWidget', 'N/search', 'N/record', 'N/redirect', 'N/runtime', 'N/log', 'N/url'],
  function (ui, search, record, redirect, runtime, log, url) {

    function escHtml(s) {
      s = (s == null ? '' : String(s));
      return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }


    function buildRecordLinksHtmlFromSearch(searchText, searchValue, childRecordType) {
      var textArr = [];
      var valueArr = [];

      if (searchText) {
        if (Object.prototype.toString.call(searchText) === '[object Array]') {
          textArr = searchText;
        } else {
          textArr = String(searchText).split(',');
        }
      }

      if (searchValue) {
        if (Object.prototype.toString.call(searchValue) === '[object Array]') {
          valueArr = searchValue;
        } else {
          valueArr = String(searchValue).split(',');
        }
      }

      if (!textArr.length && !valueArr.length) return '';

      var maxLen = Math.max(textArr.length, valueArr.length);
      var html = '<div style="white-space:normal;word-break:normal;overflow-wrap:normal;line-height:1.45;min-width:180px;">';

      for (var i = 0; i < maxLen; i++) {
        var recText = String(textArr[i] || '').trim();
        var recId = String(valueArr[i] || '').trim();
        var recUrl = '';

        if (recId) {
          try {
            recUrl = url.resolveRecord({
              recordType: childRecordType,
              recordId: recId,
              isEditMode: false
            });
          } catch (linkErr) {
            recUrl = '';
          }
        }

        html += '<div style="margin:0 0 3px 0;display:block;">';

        if (recUrl) {
          html += '<a href="' + escHtml(recUrl) + '" target="_blank" style="color:#2563eb;font-weight:900;text-decoration:underline;white-space:normal;word-break:normal;overflow-wrap:normal;">' + escHtml(recText || recId) + '</a>';
        } else {
          html += escHtml(recText || recId);
        }

        html += '</div>';
      }

      html += '</div>';
      return html;
    }

    function toISODateInput(nsDateText) {
      if (!nsDateText) return '';
      var t = String(nsDateText).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

      if (t.indexOf('/') !== -1) {
        var p = t.split('/');
        if (p.length === 3) {
          var mm = p[0], dd = p[1], yy = p[2];
          if (mm.length === 1) mm = '0' + mm;
          if (dd.length === 1) dd = '0' + dd;
          if (yy && mm && dd) return yy + '-' + mm + '-' + dd;
        }
      }
      return '';
    }

    function fromISODateInput(iso) {
      if (!iso) return null;
      var p = String(iso).split('-');
      if (p.length !== 3) return null;
      var yyyy = parseInt(p[0], 10);
      var mm = parseInt(p[1], 10);
      var dd = parseInt(p[2], 10);
      if (!yyyy || !mm || !dd) return null;
      return new Date(yyyy, mm - 1, dd);
    }

    var STATUS_COLORS = [
      '#0ea5e9', '#f97316', '#22c55e', '#ef4444', '#8b5cf6', '#14b8a6', '#64748b'
    ];

    function onRequest(context) {
      var request = context.request;
      var defaultProjectId = request.parameters.projectid || '';

      if (request.method === 'POST') {
        try {
          var changesJson = request.parameters.custpage_changes || '';
          if (changesJson) {
            var changes = JSON.parse(changesJson);

            for (var recId in changes) {
              if (!changes.hasOwnProperty(recId)) continue;

              var row = changes[recId] || {};
              var valuesToUpdate = {};

              if (row.hasOwnProperty('milestone')) {
                if (!row.milestone) {
                  valuesToUpdate.custrecord_next_milestone_date = '';
                } else {
                  var dObj = fromISODateInput(row.milestone);
                  if (dObj) valuesToUpdate.custrecord_next_milestone_date = dObj;
                }
              }

              if (row.hasOwnProperty('actionStatus')) {
                valuesToUpdate.custrecord_action_status = row.actionStatus || '';
              }

              if (row.hasOwnProperty('projectStatus')) {
                valuesToUpdate.custrecord_project_status = row.projectStatus || '';
              }

              if (row.hasOwnProperty('projectLead')) {
                valuesToUpdate.custrecord_project_lead = row.projectLead || '';
              }

              if (row.hasOwnProperty('custrecord_projteased')) {
                valuesToUpdate.custrecord_projteased = row.custrecord_projteased;
              }

              if (row.hasOwnProperty('custrecord_firequested')) {
                valuesToUpdate.custrecord_firequested = row.custrecord_firequested;
              }

              if (Object.keys(valuesToUpdate).length) {
                record.submitFields({
                  type: 'customrecord_project',
                  id: recId,
                  values: valuesToUpdate,
                  options: { enableSourcing: true, ignoreMandatoryFields: true }
                });
              }

              if (row.notes && row.notes.add && row.notes.add.length) {
                log.debug('Project note payload received', {
                  projectId: recId,
                  noteCount: row.notes.add.length
                });

                for (var ni = 0; ni < row.notes.add.length; ni++) {
                  var noteObj = row.notes.add[ni] || {};
                  if (!noteObj.memo) continue;

                  try {
                    log.debug('Project note create start', {
                      projectId: recId,
                      title: noteObj.title || ''
                    });

                    // var noteRec = record.create({
                    //   type: 'note',
                    //   isDynamic: true
                    // });

                    // noteRec.setValue({
                    //   fieldId: 'title',
                    //   value: noteObj.title || ''
                    // });

                    // noteRec.setValue({
                    //   fieldId: 'note',
                    //   value: noteObj.memo || ''
                    // });

                    // try {
                    //   noteRec.setValue({
                    //     fieldId: 'recordtype',
                    //     value: 'customrecord_project'
                    //   });
                    // } catch (rtErr) {
                    //   log.debug('Project note recordtype skipped', rtErr);
                    // }

                    // noteRec.setValue({
                    //   fieldId: 'record',
                    //   value: recId
                    // });

                    // var noteId = noteRec.save({
                    //   enableSourcing: true,
                    //   ignoreMandatoryFields: true
                    // });

var noteRec = record.create({
  type: 'note',
  isDynamic: true
});

noteRec.setValue({
  fieldId: 'title',
  value: noteObj.title || ''
});

noteRec.setValue({
  fieldId: 'notetype',
  value: noteObj.notetype || 3
});

noteRec.setValue({
  fieldId: 'direction',
  value: noteObj.direction || 1
});

noteRec.setValue({
  fieldId: 'note',
  value: noteObj.memo || ''
});

noteRec.setValue({
  fieldId: 'recordtype',
  value: 2694
});

noteRec.setValue({
  fieldId: 'record',
  value: recId
});

var noteId = noteRec.save({
  enableSourcing: true,
  ignoreMandatoryFields: true
});
                    
                    log.debug('Project note created', {
                      projectId: recId,
                      noteId: noteId
                    });
                  } catch (noteErr) {
                    log.error('Project note create error', {
                      projectId: recId,
                      errorName: noteErr.name,
                      errorMessage: noteErr.message,
                      errorObj: noteErr
                    });
                  }
                }
              }
            }
          }
        } catch (e) {
          log.error('POST update error', e);
        }

        redirect.toSuitelet({
          scriptId: runtime.getCurrentScript().id,
          deploymentId: runtime.getCurrentScript().deploymentId
        });
        return;
      }

      var form = ui.createForm({ title: ' ' });

      var changesField = form.addField({
        id: 'custpage_changes',
        type: ui.FieldType.LONGTEXT,
        label: 'changes'
      });
      changesField.updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });

      var mySearch = search.load({ id: 'customsearch_ds_project_data_search' });

      var actionOptHtml = '<option value=""></option>';
      search.create({
        type: 'customlist_action_status',
        filters: [['isinactive', 'is', 'F']],
        columns: [
          search.createColumn({ name: 'name', sort: search.Sort.ASC }),
          search.createColumn({ name: 'internalid' })
        ]
      }).run().each(function (r) {
        var id = r.getValue({ name: 'internalid' }) || '';
        var name = r.getValue({ name: 'name' }) || '';
        actionOptHtml += '<option value="' + escHtml(id) + '">' + escHtml(name) + '</option>';
        return true;
      });

      var projectStatusOptHtml = '<option value=""></option>';
      search.create({
        type: 'customlist_project_status',
        filters: [['isinactive', 'is', 'F']],
        columns: [
          search.createColumn({ name: 'name', sort: search.Sort.ASC }),
          search.createColumn({ name: 'internalid' })
        ]
      }).run().each(function (r) {
        var id = r.getValue({ name: 'internalid' }) || '';
        var name = r.getValue({ name: 'name' }) || '';
        projectStatusOptHtml += '<option value="' + escHtml(id) + '">' + escHtml(name) + '</option>';
        return true;
      });

      // Build CSM / Project Lead options
      var ownerOptHtml = '<option value=""></option>';
      var ownerMap = {};
      search.create({
        type: 'employee',
        filters: [['isinactive', 'is', 'F']],
        columns: [
          search.createColumn({ name: 'entityid', sort: search.Sort.ASC }),
          search.createColumn({ name: 'internalid' })
        ]
      }).run().each(function (r) {
        var id = r.getValue({ name: 'internalid' }) || '';
        var name = r.getValue({ name: 'entityid' }) || '';
        ownerOptHtml += '<option value="' + escHtml(id) + '">' + escHtml(name) + '</option>';
        ownerMap[id] = name;
        return true;
      });

      var GROUPS = [];
      var groupNameSet = {};

      var DESIRED_GROUP_ORDER = [
        'Onboarding',
        'Pending Actions',
        'Active Projects',
        'Proceeds Pending',
        'Stuck'
      ];

      function normName(s){
        return (s == null ? '' : String(s))
          .trim()
          .toLowerCase()
          .replace(/\s+/g,' ');
      }

      var statusByNorm = {};
      search.create({
        type: 'customlist_project_status',
        filters: [['isinactive', 'is', 'F']],
        columns: [
          search.createColumn({ name: 'name' }),
          search.createColumn({ name: 'internalid' })
        ]
      }).run().each(function (r) {
        var name = (r.getValue({ name: 'name' }) || '').trim();
        if (!name) return true;
        if (name.toLowerCase() === 'complete') return true;
        statusByNorm[normName(name)] = name;
        return true;
      });

      for (var i = 0; i < DESIRED_GROUP_ORDER.length; i++) {
        var want = DESIRED_GROUP_ORDER[i];
        var actualName = statusByNorm[normName(want)];

        if (actualName) {
          var color = STATUS_COLORS[GROUPS.length % STATUS_COLORS.length];
          GROUPS.push({ key: actualName, color: color });
          groupNameSet[actualName] = true;
        }
      }

      var STATUS_COLOR_MAP = {};
      for (var sc = 0; sc < GROUPS.length; sc++) {
        STATUS_COLOR_MAP[GROUPS[sc].key] = GROUPS[sc].color;
      }

      var rows = [];
      mySearch.run().each(function (r) {
        var recId = r.id;

        var project = r.getValue('name') || '';
        var client = r.getText('custrecord_client') || '';
        var owner = r.getText('custrecord_project_lead') || '';
        var ownerVal = r.getValue('custrecord_project_lead') || '';
        var sales = r.getText('custrecord_sales_lead') || '';

        var milestoneText = r.getText('custrecord_next_milestone_date') || r.getValue('custrecord_next_milestone_date') || '';
        var milestoneInput = toISODateInput(milestoneText);

        var actionVal = r.getValue('custrecord_action_status') || '';
        var actionText = r.getText('custrecord_action_status') || '';

        var projectStatusVal = r.getValue('custrecord_project_status') || '';
        var projectStatusText = (r.getText('custrecord_project_status') || '').trim();

        if (!projectStatusText) return true;
        if (!groupNameSet[projectStatusText]) return true;

        var location = r.getText('custrecord_associated_location') || '';
        var locationVal = r.getValue('custrecord_associated_location') || '';
        var locationHtml = buildRecordLinksHtmlFromSearch(location, locationVal, 'location');

        var events = r.getText('custrecord_affiliated_events') || '';
        var eventsVal = r.getValue('custrecord_affiliated_events') || '';
        var eventsHtml = buildRecordLinksHtmlFromSearch(events, eventsVal, 'calendarevent');
        var projTeased = r.getValue('custrecord_projteased') || 'F';
        var fiRequested = r.getValue('custrecord_firequested') || 'F';

        var projectUrl = '';
        try {
          projectUrl = url.resolveRecord({
            recordType: 'customrecord_project',
            recordId: recId,
            isEditMode: false
          });
        } catch (e) {
          projectUrl = '';
        }

        rows.push({
          recId: recId,
          project: project,
          projectUrl: projectUrl,
          client: client,
          owner: owner,
          ownerVal: ownerVal,
          sales: sales,
          milestoneInput: milestoneInput,
          actionVal: actionVal,
          actionText: actionText,
          projectStatusVal: projectStatusVal,
          projectStatusText: projectStatusText,
          location: location,
          locationHtml: locationHtml,
          events: events,
          eventsHtml: eventsHtml,
          projTeased: projTeased,
          fiRequested: fiRequested
        });

        return true;
      });

      var grouped = {};
      for (var g = 0; g < GROUPS.length; g++) {
        grouped[GROUPS[g].key] = [];
      }
      for (i = 0; i < rows.length; i++) {
        grouped[rows[i].projectStatusText].push(rows[i]);
      }

      var counts = {};
      for (var k = 0; k < GROUPS.length; k++) {
        counts[GROUPS[k].key] = (grouped[GROUPS[k].key] || []).length;
      }

      function uniqSorted(arr) {
        var map = {};
        for (var x = 0; x < arr.length; x++) {
          var v = (arr[x] == null ? '' : String(arr[x])).trim();
          if (v) map[v] = true;
        }
        var out = [];
        for (var key in map) {
          if (map.hasOwnProperty(key)) out.push(key);
        }
        out.sort(function (a, b) { return a.localeCompare(b); });
        return out;
      }

      var projectMap = {};
      for (var rp = 0; rp < rows.length; rp++) {
        if (rows[rp].recId) {
          projectMap[rows[rp].recId] = rows[rp].project || '';
        }
      }

      var projectOpt = '<option value=""></option>';
      var projectKeys = Object.keys(projectMap).sort(function(a, b){
        var aName = projectMap[a] || '';
        var bName = projectMap[b] || '';
        return aName.localeCompare(bName);
      });

      for (var pk = 0; pk < projectKeys.length; pk++) {
        var pid = projectKeys[pk];
        var pname = projectMap[pid] || '';
        var selected = (String(defaultProjectId) === String(pid)) ? ' selected' : '';
        projectOpt += '<option value="' + escHtml(pid) + '"' + selected + '>' + escHtml(pname) + '</option>';
      }

      var clientList = uniqSorted(rows.map(function (r) { return r.client; }));
      var ownerList = uniqSorted(rows.map(function (r) { return r.owner; }));
      var salesList = uniqSorted(rows.map(function (r) { return r.sales; }));

      var clientOpt = clientList.map(function (c) {
        return '<option value="' + escHtml(c) + '">' + escHtml(c) + '</option>';
      }).join('');

      var ownerOpt = ownerList.map(function (o) {
        return '<option value="' + escHtml(o) + '">' + escHtml(o) + '</option>';
      }).join('');

      var salesOpt = '<option value=""></option>' + salesList.map(function (s) {
        return '<option value="' + escHtml(s) + '">' + escHtml(s) + '</option>';
      }).join('');

      var maxKey = '';
      var maxCount = -1;
      for (var mk = 0; mk < GROUPS.length; mk++) {
        var key2 = GROUPS[mk].key;
        var c2 = counts[key2] || 0;
        if (c2 > maxCount) {
          maxCount = c2;
          maxKey = key2;
        }
      }

      var notePopupUrl = '/app/site/hosting/scriptlet.nl?script=2681&deploy=1';

      var html = `
      <script>
  document.title = 'Project Dashboard';
</script>
<style>
  .uir-page-title, .uir-page-title-firstline, .uir-page-title-secondline { display:none !important; }
  #div__header, #div__footer { display:none !important; }
  body{margin:0;padding:0;background:#f4f6fa;font-family:Arial;}
  #main_form{padding:0 !important;margin:0 !important;}

  .topbar{
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:18px 18px;
    background:#fff;
    border-bottom:1px solid #e5e7eb;
  }
  .topbar-left{ display:flex; align-items:center; gap:10px; }
  .title{
    flex:1;
    text-align:center;
    font-size:22px;
    font-weight:900;
    color:#111827;
    margin:0;
  }

  .btn{
    border:0;
    font-weight:800;
    border-radius:10px;
    padding:10px 14px;
    cursor:pointer;
    box-shadow:0 6px 18px rgba(0,0,0,0.10);
  }
  .btn-dark{ background:#111827; color:#fff; }
  .btn-lite{ background:#e2e8f0; color:#111827; border:1px solid #cbd5e1; box-shadow:none; }

  .wrap{ white-space:normal; word-break:break-word; }

  .container{ padding:16px; }

  .changebox{
    background:#fff;
    border:1px solid #e5e7eb;
    border-radius:12px;
    padding:12px;
    margin-bottom:14px;
  }
  .changebox-top{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:10px;
    margin-bottom:8px;
  }
  .changebox-title{
    font-weight:900;
    color:#111827;
    font-size:13px;
  }
  .changebox-count{
    font-weight:900;
    font-size:12px;
    color:#fb923c;
  }
  .changebox-empty{
    font-size:12px;
    font-weight:700;
    color:#64748b;
  }
  .change-list{
    max-height:180px;
    overflow:auto;
    border-top:1px dashed #e5e7eb;
    padding-top:8px;
  }
  .chg{
    display:flex;
    gap:10px;
    padding:6px 0;
    border-bottom:1px solid #f1f5f9;
    font-size:12px;
  }
  .chg:last-child{ border-bottom:0; }
  .chg .pname{
    font-weight:900;
    color:#111827;
    min-width:220px;
  }
  .chg .fld{
    font-weight:900;
    color:#2563eb;
    min-width:150px;
  }
  .chg .old{
    color:#64748b;
    word-break:break-word;
  }
  .chg .arrow{
    color:#94a3b8;
    font-weight:900;
  }
  .chg .new{
    color:#111827;
    font-weight:800;
    word-break:break-word;
  }
  .mini-btn{
    border:1px solid #cbd5e1;
    background:#f8fafc;
    padding:7px 10px;
    border-radius:10px;
    cursor:pointer;
    font-weight:900;
    font-size:12px;
  }

  details.section{
    background:#fff;
    border:1px solid #e5e7eb;
    border-radius:14px;
    overflow:hidden;
    margin-bottom:12px;
  }
  details.section summary{
    list-style:none;
    padding:14px 14px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    cursor:pointer;
    user-select:none;
  }
  details.section summary::-webkit-details-marker{ display:none; }

  .summary-left{ display:flex; align-items:center; gap:10px; }
  .summary-bar{ width:5px; height:18px; border-radius:999px; background:#94a3b8; }
  .summary-title{ font-weight:900; color:#111827; }
  .summary-meta{ font-size:12px; font-weight:800; color:#64748b; margin-left:8px; }
  .chev{ font-size:18px; color:#64748b; font-weight:900; }

  table.board{width:100%;border-collapse:collapse;}
  table.board th{
    text-align:left;
    padding:11px 12px;
    font-size:12px;
    color:#6b7280;
    border-top:1px solid #eef2f7;
    border-bottom:1px solid #eef2f7;
    background:#fafafa;
    cursor:pointer;
    user-select:none;
    white-space:nowrap;
  }
  table.board th:hover{ background:#f0f2f5; }
  table.board th .sort-arrow{
    display:inline-block;
    margin-left:4px;
    font-size:10px;
    color:#94a3b8;
  }
  table.board th.sorted-asc .sort-arrow{ color:#111827; }
  table.board th.sorted-desc .sort-arrow{ color:#111827; }
  table.board td{
    padding:12px;
    border-bottom:1px solid #f1f5f9;
    font-size:13px;
    vertical-align:middle;
  }

  .edit{
    padding:8px 10px;
    border-radius:10px;
    border:1px solid #d1d5db;
    background:#fff;
    font-size:12px;
    min-width:150px;
  }

  select.actionStatus{
    font-weight:900;
    border:0;
    padding:9px 12px;
    border-radius:12px;
    color:#fff;
    min-width:190px;
    box-shadow:0 6px 16px rgba(0,0,0,0.08);
    appearance:auto;
  }

  select.projStatus{
    font-weight:900;
    padding:9px 12px;
    border-radius:12px;
    min-width:200px;
    border:1px solid #d1d5db;
    background:#fff;
    box-shadow:0 6px 16px rgba(0,0,0,0.06);
    appearance:auto;
  }

  select.csmSelect{
    font-weight:700;
    padding:9px 12px;
    border-radius:12px;
    min-width:170px;
    border:1px solid #d1d5db;
    background:#fff;
    box-shadow:0 6px 16px rgba(0,0,0,0.06);
    appearance:auto;
    font-size:12px;
  }

  input.milestone{
    font-weight:900;
    border:0;
    padding:9px 12px;
    border-radius:12px;
    color:#111827;
    min-width:160px;
    box-shadow:0 6px 16px rgba(0,0,0,0.06);
    background:#fff;
  }

  tr.row-changed td{ background:#fff7ed !important; }
  tr.row-changed td:first-child{ box-shadow: inset 4px 0 0 #fb923c; }

  details.filter-section{
    background:#fff;
    border:1px solid #e5e7eb;
    border-radius:8px;
    overflow:hidden;
    margin-bottom:14px;
  }
  details.filter-section summary{
    padding:10px 12px;
    background:#f3f4f6;
    border-bottom:1px solid #e5e7eb;
  }
  details.filter-section summary::-webkit-details-marker{ display:none; }

  .filter-body{ padding:12px; border-top:0; }

  .filter-grid{
    display:grid;
    grid-template-columns: 220px 260px 260px 220px 320px 90px;
    gap:12px;
    align-items:end;
  }
  .fg{ display:flex; flex-direction:column; gap:6px; }

  .flabel{
    font-size:11px;
    font-weight:700;
    color:#6b7280;
    text-transform:uppercase;
    letter-spacing:.02em;
  }

  .fselect, .fdate{
    border:1px solid #cbd5e1;
    border-radius:4px;
    background:#ffffff;
    padding:8px 10px;
    font-weight:600;
    color:#111827;
    box-shadow:none;
  }
  .fselect{ min-height:40px; }
  select.fselect{ appearance:auto; cursor:pointer; }

  select.fselect[multiple]{
    height:80px;
    border-radius:4px;
    background:#ffffff;
  }

  .fselect:focus, .fdate:focus{
    outline:none;
    border-color:#4f87ff;
    box-shadow:0 0 0 2px rgba(79,135,255,.20);
  }

  .date-row{
    display:grid;
    grid-template-columns: 1fr 1fr;
    gap:10px;
  }

  @media (max-width: 1300px){
    .filter-grid{ grid-template-columns: 1fr 1fr; }
  }

  #btn_clear_filters{
    background:#e2e8f0 !important;
    border:1px solid #cbd5e1 !important;
    box-shadow:none !important;
    padding:8px 10px !important;
    border-radius:10px !important;
    min-width:90px !important;
    width:90px !important;
    font-size:12px !important;
    font-weight:800 !important;
    white-space:nowrap !important;
  }

  .note-cell-wrap{ min-width:220px; }
  .note-draft-card{
    border:1px solid #e5e7eb;
    background:#f8fafc;
    border-radius:10px;
    padding:8px;
    margin-bottom:8px;
  }
  .note-draft-title{
    font-size:12px;
    font-weight:900;
    color:#111827;
    margin-bottom:4px;
  }
  .note-draft-memo{
    font-size:12px;
    color:#475569;
    white-space:normal;
    word-break:break-word;
    margin-bottom:6px;
  }
  .note-action-btn{
    border:1px solid #cbd5e1;
    background:#ffffff;
    border-radius:8px;
    padding:5px 8px;
    font-size:11px;
    font-weight:900;
    cursor:pointer;
    margin-right:4px;
  }
  .note-remove-btn{ color:#dc2626; }
  .note-add-btn{
    border:1px solid #93c5fd;
    background:#eff6ff;
    color:#2563eb;
    border-radius:9px;
    padding:7px 10px;
    font-size:12px;
    font-weight:900;
    cursor:pointer;
  }

  .dd-menu{
    position:absolute;
    z-index:999999;
    min-width:240px;
    max-height:320px;
    overflow:auto;
    background:#fff;
    border:1px solid #d1d5db;
    border-radius:12px;
    box-shadow:0 20px 40px rgba(0,0,0,0.18);
    padding:6px;
    display:none;
  }
  .dd-item{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:10px;
    padding:10px 10px;
    border-radius:10px;
    font-weight:900;
    font-size:13px;
    cursor:pointer;
    user-select:none;
  }
  .dd-item:hover{ filter:brightness(0.97); }
  .dd-item .tick{ font-weight:900; opacity:0.9; }
  .dd-backdrop{
    position:fixed;
    left:0;top:0;right:0;bottom:0;
    z-index:999998;
    display:none;
  }
</style>

<div class="topbar">
  <div class="topbar-left">
    <button type="button" class="btn btn-dark" id="custpage_custom_submit">Submit</button>
    <button type="button" class="btn btn-lite" id="btn_download_excel">Download Excel</button>
    <button type="button" class="btn btn-lite" id="btn_expand_all">Expand All</button>
    <button type="button" class="btn btn-lite" id="btn_close_all">Collapse All</button>
  </div>
  <div class="title">Client Project Board</div>
  <div style="width:240px;"></div>
</div>

<div class="container">

  <div class="changebox" id="changebox">
    <div class="changebox-top">
      <div class="changebox-title">Pending Project Updates</div>
      <div style="display:flex;gap:10px;align-items:center;">
        <div class="changebox-count" id="chg_count">0</div>
        <button type="button" class="mini-btn" id="btn_reset_changes" title="Reset changes back to original values">Reset changes</button>
      </div>
    </div>
    <div class="changebox-empty" id="chg_empty">No changes yet.</div>
    <div class="change-list" id="chg_list" style="display:none;"></div>
  </div>

  <details class="filter-section" id="filters_section" open>
    <summary>Filters</summary>
    <div class="filter-body">
      <div class="filter-grid">
        <div class="fg">
          <div class="flabel">Project</div>
          <select class="fselect" id="f_project">
            ${projectOpt}
          </select>
        </div>

        <div class="fg">
          <div class="flabel">Client (Multi-Select)</div>
          <select class="fselect" id="f_client" multiple>
            ${clientOpt}
          </select>
        </div>

        <div class="fg">
         <div class="flabel">Client Service Manager (Multi-Select)</div>
         <select class="fselect" id="f_owner" multiple>
           ${ownerOpt}
         </select>
       </div>

        <div class="fg">
          <div class="flabel">Sales Team</div>
          <select class="fselect" id="f_sales">
            ${salesOpt}
          </select>
        </div>

        <div class="fg">
          <div class="flabel">Milestone Date (From / To)</div>
          <div class="date-row">
            <input class="fdate" type="date" id="f_ms_from">
            <input class="fdate" type="date" id="f_ms_to">
          </div>
        </div>

        <div class="fg" style="justify-content:flex-end;">
          <button type="button" class="btn btn-lite" id="btn_clear_filters">Clear</button>
        </div>
      </div>
    </div>
  </details>

  ${GROUPS.map(function(gr){
    var list = grouped[gr.key] || [];
    var c = list.length || 0;
    var label = (c === 1 ? '1 project' : (c + ' projects'));
    var openAttr = 'open';

    var table = `
    <table class="board">
      <thead>
        <tr>
          <th data-sort-col="0" data-sort-type="text" style="width:260px;">Client <span class="sort-arrow">⇅</span></th>
          <th data-sort-col="1" data-sort-type="text" style="width:220px;">Project <span class="sort-arrow">⇅</span></th>
          <th data-sort-col="2" data-sort-type="select" style="width:170px;">Client Service Manager <span class="sort-arrow">⇅</span></th>
          <th data-sort-col="3" data-sort-type="text" style="width:160px;">Sales Team <span class="sort-arrow">⇅</span></th>
          <th data-sort-col="4" data-sort-type="select" style="width:200px;">Project Status <span class="sort-arrow">⇅</span></th>
          <th data-sort-col="5" data-sort-type="date" style="width:190px;">Next Milestone Date <span class="sort-arrow">⇅</span></th>
          <th data-sort-col="6" data-sort-type="select" style="width:220px;">Action Status <span class="sort-arrow">⇅</span></th>
          <th style="width:110px;">Project Teased</th>
          <th style="width:110px;">FI Requested</th>
          <th data-sort-col="7" data-sort-type="text" style="width:320px;min-width:320px;">Location <span class="sort-arrow">⇅</span></th>
          <th data-sort-col="8" data-sort-type="text" style="width:280px;min-width:280px;">Events <span class="sort-arrow">⇅</span></th>
          <th style="width:260px;">Notes</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(function(row){
          return `
            <tr data-recid="${escHtml(row.recId)}"
                data-projectid="${escHtml(row.recId)}"
                data-group="${escHtml(gr.key)}"
                data-project="${escHtml(row.project)}"
                data-projecturl="${escHtml(row.projectUrl || '')}"
                data-client="${escHtml(row.client)}"
                data-owner="${escHtml(row.owner)}"
                data-sales="${escHtml(row.sales)}"
                data-msdate="${escHtml(row.milestoneInput || '')}">
              <td class="wrap">${escHtml(row.client)}</td>
              <td class="wrap">
                <a href="${escHtml(row.projectUrl || '#')}" target="_blank" style="color:#2563eb;font-weight:900;text-decoration:none;">
                  ${escHtml(row.project)}
                </a>
              </td>

              <td>
                <select class="csmSelect edit"
                  data-orig="${escHtml(row.ownerVal || '')}">
                  ${ownerOptHtml}
                </select>
              </td>

              <td class="wrap">${escHtml(row.sales)}</td>

              <td>
                <select class="projStatus edit"
                  data-orig="${escHtml(row.projectStatusVal || '')}">
                  ${projectStatusOptHtml}
                </select>
              </td>

              <td>
                <input type="date"
                  class="milestone edit"
                  value="${escHtml(row.milestoneInput || '')}"
                  data-orig="${escHtml(row.milestoneInput || '')}">
              </td>

              <td>
                <select class="actionStatus edit"
                  data-orig="${escHtml(row.actionVal || '')}">
                  ${actionOptHtml}
                </select>
              </td>

              <td>
                <input type="checkbox"
                  class="chk-projteased"
                  data-orig="${escHtml(row.projTeased || 'F')}"
                  ${row.projTeased === 'T' ? 'checked' : ''}>
              </td>

              <td>
                <input type="checkbox"
                  class="chk-firequested"
                  data-orig="${escHtml(row.fiRequested || 'F')}"
                  ${row.fiRequested === 'T' ? 'checked' : ''}>
              </td>

              <td class="wrap" style="min-width:320px;max-width:420px;">
                ${row.locationHtml || escHtml(row.location)}
              </td>
              <td class="wrap" style="min-width:280px;max-width:380px;">
                ${row.eventsHtml || escHtml(row.events)}
              </td>

              <td class="wrap note-cell-wrap">
                <div class="note-draft-list" data-note-box="${escHtml(row.recId)}"></div>
                <button type="button" class="note-add-btn btn-add-note" data-recid="${escHtml(row.recId)}">+</button>
                <button type="button" class="note-add-btn btn-view-note" data-recid="${escHtml(row.recId)}" style="margin-left:6px;">View Notes</button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>`;

    return `
      <details class="section" id="sec_${escHtml(gr.key)}" ${openAttr}>
        <summary>
          <div class="summary-left">
            <div class="summary-bar" style="background:${gr.color}"></div>
            <div class="summary-title" style="color:${gr.color};">${escHtml(gr.key)}</div>
            <div class="summary-meta" data-count-for="${escHtml(gr.key)}" style="color:${gr.color};">${label}</div>
          </div>
          <div class="chev">›</div>
        </summary>
        ${table}
      </details>
    `;
  }).join('')}

</div>

<script>
(function(){
  var PROJECT_STATUS_COLOR = ${JSON.stringify(STATUS_COLOR_MAP || {})};
  var NOTE_POPUP_URL = ${JSON.stringify(notePopupUrl || '')};
  var NOTE_DRAFTS = {};

  function norm(s){ return (s == null ? '' : String(s)).trim(); }

  function setProjectStatusColor(sel){
    if (!sel) return;
    var txt = '';
    if (sel.selectedIndex >= 0) txt = sel.options[sel.selectedIndex].text || '';
    var c = PROJECT_STATUS_COLOR[norm(txt)] || '#111827';
    sel.style.color = c;
    sel.style.borderColor = '#d1d5db';
    sel.style.boxShadow = '0 6px 16px rgba(0,0,0,0.06)';
    sel.style.background = '#ffffff';
  }

  /* ── Per-status unique colors ── */
  var ACTION_COLOR_MAP = {
    'Field Action To Occur':         { bg:'#7c3aed', fg:'#fff' },
    'Pick Up Day Pending':           { bg:'#dc2626', fg:'#fff' },
    'Client TBD':                    { bg:'#6366f1', fg:'#fff' },
    'Warehouse Documentation':       { bg:'#0891b2', fg:'#fff' },
    'Internal Pause':                { bg:'#b91c1c', fg:'#fff' },
    'Sales Team':                    { bg:'#4f46e5', fg:'#fff' },
    'Signed Invoices Needed':        { bg:'#ca8a04', fg:'#fff' },
    'Logistics':                     { bg:'#0d9488', fg:'#fff' },
    'Scheduled':                     { bg:'#16a34a', fg:'#fff' },
    'Payment Pending':               { bg:'#ef4444', fg:'#fff' },
    'On Going':                      { bg:'#22c55e', fg:'#fff' },
    'Managed':                       { bg:'#15803d', fg:'#fff' },
    'Quote Pending':                 { bg:'#d97706', fg:'#fff' },
    'Remote Doc (app sent)':         { bg:'#2563eb', fg:'#fff' },
    'Proceeds Pending':              { bg:'#f59e0b', fg:'#fff' },
    'Onboarding Call Scheduled':     { bg:'#8b5cf6', fg:'#fff' },
    'LIVE (eBay)':                   { bg:'#059669', fg:'#fff' },
    'LIVE':                          { bg:'#10b981', fg:'#fff' },
    'Remote Documentation':          { bg:'#3b82f6', fg:'#fff' },
    'Client Field Pick Up / Drop Off': { bg:'#be123c', fg:'#fff' },
    'Project Review':                { bg:'#0ea5e9', fg:'#fff' },
    'STUCK':                         { bg:'#991b1b', fg:'#fff' },
    'TAGeX Remote Doc':              { bg:'#1d4ed8', fg:'#fff' },
    'Ecomm Auction Launch':          { bg:'#a855f7', fg:'#fff' },
    'Proceeds Sent':                 { bg:'#14b8a6', fg:'#fff' }
  };

  function actionBgByText(txt){
    txt = norm(txt);
    if (!txt) return { bg:'#ffffff', fg:'#111827' };
    var c = ACTION_COLOR_MAP[txt];
    if (c) return c;
    return { bg:'#2563eb', fg:'#ffffff' };
  }

  function setSelectColor(sel){
    if (!sel) return;
    var txt = '';
    if (sel.selectedIndex >= 0) txt = sel.options[sel.selectedIndex].text || '';

    if (!norm(sel.value)) {
      sel.style.background = '#ffffff';
      sel.style.color = '#111827';
      sel.style.border = '1px solid #d1d5db';
      sel.style.boxShadow = '0 6px 16px rgba(0,0,0,0.06)';
      return;
    }
    var c = actionBgByText(txt);
    sel.style.background = c.bg;
    sel.style.color = c.fg;
    sel.style.border = '0';
    sel.style.boxShadow = '0 6px 16px rgba(0,0,0,0.10)';
  }

  function isWindows(){
    var ua = navigator.userAgent || '';
    return /Windows/i.test(ua);
  }

  function stashStyle(el){
    if (!el) return;
    if (el.getAttribute('data__stash') === '1') return;
    el.setAttribute('data__stash', '1');
    el.setAttribute('data__bg', el.style.background || '');
    el.setAttribute('data__color', el.style.color || '');
    el.setAttribute('data__border', el.style.border || '');
    el.setAttribute('data__box', el.style.boxShadow || '');
  }

  function applyPlainOpenStyle(el){
    if (!el) return;
    stashStyle(el);
    el.style.background = '#ffffff';
    el.style.color = '#111827';
    el.style.border = '1px solid #d1d5db';
    el.style.boxShadow = '0 6px 16px rgba(0,0,0,0.06)';
  }

  function restoreStyle(el){
    if (!el) return;
    if (el.classList.contains('actionStatus')) setSelectColor(el);
    if (el.classList.contains('projStatus')) setProjectStatusColor(el);
  }

  function bindPlainDropdownOnWindows(){
    if (!isWindows()) return;

    var sels = document.querySelectorAll('select.actionStatus, select.projStatus');
    for (var i=0;i<sels.length;i++){
      (function(sel){
        sel.addEventListener('mousedown', function(){
          applyPlainOpenStyle(sel);
        }, true);

        sel.addEventListener('keydown', function(){
          applyPlainOpenStyle(sel);
        }, true);

        sel.addEventListener('blur', function(){
          restoreStyle(sel);
        }, true);

        sel.addEventListener('change', function(){
          restoreStyle(sel);
        }, true);
      })(sels[i]);
    }
  }

  function isIOS(){
    var ua = navigator.userAgent || '';
    var iDevice = /iPad|iPhone|iPod/.test(ua);
    var iPadOS13Plus = (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return iDevice || iPadOS13Plus;
  }

  var ddBackdrop = null;

  function ensureBackdrop(){
    if (ddBackdrop) return ddBackdrop;
    ddBackdrop = document.createElement('div');
    ddBackdrop.className = 'dd-backdrop';
    document.body.appendChild(ddBackdrop);
    ddBackdrop.addEventListener('click', hideAllMenus);
    return ddBackdrop;
  }

  function hideAllMenus(){
    var menus = document.querySelectorAll('.dd-menu');
    for (var i=0;i<menus.length;i++) menus[i].style.display = 'none';
    if (ddBackdrop) ddBackdrop.style.display = 'none';
  }

  function openMenu(menu, anchorEl){
    hideAllMenus();
    var r = anchorEl.getBoundingClientRect();
    menu.style.left = (window.scrollX + r.left) + 'px';
    menu.style.top  = (window.scrollY + r.bottom + 6) + 'px';
    menu.style.minWidth = Math.max(240, r.width) + 'px';
    menu.style.display = 'block';
    ensureBackdrop().style.display = 'block';
  }

  function optionStyleFor(selectEl, optText){
    if (selectEl.classList.contains('actionStatus')){
      var c = actionBgByText(optText);
      return { bg: c.bg, fg: c.fg };
    }
    if (selectEl.classList.contains('projStatus')){
      var col = PROJECT_STATUS_COLOR[norm(optText)] || '#111827';
      return { bg: '#ffffff', fg: col };
    }
    return { bg:'#ffffff', fg:'#111827' };
  }

  function buildMenuForSelect(selectEl){
    var menu = document.createElement('div');
    menu.className = 'dd-menu';

    function render(){
      menu.innerHTML = '';
      for (var i=0;i<selectEl.options.length;i++){
        var opt = selectEl.options[i];
        var val = opt.value;
        var text = opt.text || '';
        var st = optionStyleFor(selectEl, text);

        var item = document.createElement('div');
        item.className = 'dd-item';
        item.style.background = st.bg;
        item.style.color = st.fg;

        var left = document.createElement('div');
        left.textContent = text || '(blank)';

        var tick = document.createElement('div');
        tick.className = 'tick';
        tick.textContent = (selectEl.value === val ? '✓' : '');

        item.appendChild(left);
        item.appendChild(tick);

        (function(v){
          item.addEventListener('click', function(){
            selectEl.value = v;

            if (selectEl.classList.contains('actionStatus')) setSelectColor(selectEl);
            if (selectEl.classList.contains('projStatus')) setProjectStatusColor(selectEl);

            try {
              var ev = new Event('change', { bubbles:true });
              selectEl.dispatchEvent(ev);
            } catch(e) {}

            hideAllMenus();
          });
        })(val);

        menu.appendChild(item);
      }
    }

    document.body.appendChild(menu);

    selectEl.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      render();
      openMenu(menu, selectEl);
    }, true);

    window.addEventListener('scroll', hideAllMenus, true);
    window.addEventListener('resize', hideAllMenus, true);

    return menu;
  }

  function initIOSDropdowns(){
    if (!isIOS()) return;
    var sels = document.querySelectorAll('select.actionStatus, select.projStatus');
    for (var i=0;i<sels.length;i++){
      buildMenuForSelect(sels[i]);
    }
  }

  function ymdToDate(ymd){
    if (!ymd) return null;
    var p = String(ymd).split('-');
    if (p.length !== 3) return null;
    var y = parseInt(p[0],10), m = parseInt(p[1],10), d = parseInt(p[2],10);
    if (!y || !m || !d) return null;
    return new Date(y, m-1, d);
  }

  function stripTime(dt){
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  }

  function markRowChangedIfNeeded(tr){
    if (!tr) return;
    var ms = tr.querySelector('input.milestone');
    var as = tr.querySelector('select.actionStatus');
    var ps = tr.querySelector('select.projStatus');
    var cs = tr.querySelector('select.csmSelect');
    var pt = tr.querySelector('input.chk-projteased');
    var fi = tr.querySelector('input.chk-firequested');
    var changed = false;

    if (ms){
      var o = ms.getAttribute('data-orig') || '';
      if ((ms.value || '') !== o) changed = true;
    }
    if (as){
      var ao = as.getAttribute('data-orig') || '';
      if ((as.value || '') !== ao) changed = true;
    }
    if (ps){
      var po = ps.getAttribute('data-orig') || '';
      if ((ps.value || '') !== po) changed = true;
    }
    if (cs){
      var co = cs.getAttribute('data-orig') || '';
      if ((cs.value || '') !== co) changed = true;
    }
    if (pt){
      var pto = pt.getAttribute('data-orig') || 'F';
      var ptn = pt.checked ? 'T' : 'F';
      if (ptn !== pto) changed = true;
    }
    if (fi){
      var fio = fi.getAttribute('data-orig') || 'F';
      var fin = fi.checked ? 'T' : 'F';
      if (fin !== fio) changed = true;
    }

    if (changed) tr.classList.add('row-changed');
    else tr.classList.remove('row-changed');
  }

  function fmtVal(v){
    v = norm(v);
    return v || '(blank)';
  }

  function getProjectNameFromRow(tr){
    var a = tr.querySelector('td a');
    if (a && norm(a.textContent)) return norm(a.textContent);
    return norm(tr.getAttribute('data-project')) || ('Record ' + (tr.getAttribute('data-recid')||''));
  }

  function selectTextFromEl(sel){
    if (!sel) return '';
    if (!sel.value) return '';
    var idx = sel.selectedIndex;
    if (idx >= 0 && sel.options[idx]) return sel.options[idx].text || '';
    return '';
  }

  function actionTextFromSelect(sel){ return selectTextFromEl(sel); }
  function projTextFromSelect(sel){ return selectTextFromEl(sel); }

  function renderChangeBox(){
    var listEl = document.getElementById('chg_list');
    var emptyEl = document.getElementById('chg_empty');
    var countEl = document.getElementById('chg_count');

    var items = [];
    var trs = document.querySelectorAll('tr[data-recid]');

    for (var i=0;i<trs.length;i++){
      var tr = trs[i];
      var recId = tr.getAttribute('data-recid') || '';
      var projectName = getProjectNameFromRow(tr);

      var ms = tr.querySelector('input.milestone');
      var as = tr.querySelector('select.actionStatus');
      var ps = tr.querySelector('select.projStatus');
      var cs = tr.querySelector('select.csmSelect');
      var pt = tr.querySelector('input.chk-projteased');
      var fi = tr.querySelector('input.chk-firequested');

      if (ms){
        var o = ms.getAttribute('data-orig') || '';
        var n = ms.value || '';
        if (n !== o){
          items.push({ recId: recId, project: projectName, field: 'Milestone Date', oldVal: fmtVal(o), newVal: fmtVal(n) });
        }
      }

      if (as){
        var ao = as.getAttribute('data-orig') || '';
        var an = as.value || '';
        if (an !== ao){
          var oldText = '';
          for (var x=0; x<as.options.length; x++){
            if (as.options[x].value === ao){ oldText = as.options[x].text || ''; break; }
          }
          var newText = actionTextFromSelect(as);
          items.push({ recId: recId, project: projectName, field: 'Action Status', oldVal: fmtVal(oldText || ao), newVal: fmtVal(newText || an) });
        }
      }

      if (ps){
        var po = ps.getAttribute('data-orig') || '';
        var pn = ps.value || '';
        if (pn !== po){
          var oldText2 = '';
          for (var y=0; y<ps.options.length; y++){
            if (ps.options[y].value === po){ oldText2 = ps.options[y].text || ''; break; }
          }
          var newText2 = projTextFromSelect(ps);
          items.push({ recId: recId, project: projectName, field: 'Project Status', oldVal: fmtVal(oldText2 || po), newVal: fmtVal(newText2 || pn) });
        }
      }

      if (cs){
        var cso = cs.getAttribute('data-orig') || '';
        var csn = cs.value || '';
        if (csn !== cso){
          var oldText3 = '';
          for (var z=0; z<cs.options.length; z++){
            if (cs.options[z].value === cso){ oldText3 = cs.options[z].text || ''; break; }
          }
          var newText3 = selectTextFromEl(cs);
          items.push({ recId: recId, project: projectName, field: 'Client Service Manager', oldVal: fmtVal(oldText3 || cso), newVal: fmtVal(newText3 || csn) });
        }
      }

      if (pt){
        var pto = pt.getAttribute('data-orig') || 'F';
        var ptn = pt.checked ? 'T' : 'F';
        if (ptn !== pto){
          items.push({ recId: recId, project: projectName, field: 'Project Teased', oldVal: (pto === 'T' ? 'Checked' : 'Unchecked'), newVal: (ptn === 'T' ? 'Checked' : 'Unchecked') });
        }
      }

      if (fi){
        var fio = fi.getAttribute('data-orig') || 'F';
        var fin = fi.checked ? 'T' : 'F';
        if (fin !== fio){
          items.push({ recId: recId, project: projectName, field: 'FI Requested', oldVal: (fio === 'T' ? 'Checked' : 'Unchecked'), newVal: (fin === 'T' ? 'Checked' : 'Unchecked') });
        }
      }
    }

    countEl.textContent = String(items.length || 0);

    if (!items.length){
      emptyEl.style.display = '';
      listEl.style.display = 'none';
      listEl.innerHTML = '';
      return;
    }

    emptyEl.style.display = 'none';
    listEl.style.display = '';

    var out = '';
    for (var j=0;j<items.length;j++){
      var it = items[j];
      out += ''
        + '<div class="chg">'
        +   '<div class="pname">' + esc(it.project) + '</div>'
        +   '<div class="fld">' + esc(it.field) + '</div>'
        +   '<div class="old">' + esc(it.oldVal) + '</div>'
        +   '<div class="arrow">→</div>'
        +   '<div class="new">' + esc(it.newVal) + '</div>'
        + '</div>';
    }
    listEl.innerHTML = out;
  }

  function esc(s){
    s = (s == null ? '' : String(s));
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function buildChangesJson(){
    var changes = {};
    var trs = document.querySelectorAll('tr[data-recid]');
    for (var i=0;i<trs.length;i++){
      var tr = trs[i];
      var recId = tr.getAttribute('data-recid');
      var ms = tr.querySelector('input.milestone');
      var as = tr.querySelector('select.actionStatus');
      var ps = tr.querySelector('select.projStatus');
      var cs = tr.querySelector('select.csmSelect');
      var pt = tr.querySelector('input.chk-projteased');
      var fi = tr.querySelector('input.chk-firequested');

      var rowObj = {};
      var hasChange = false;

      if (ms){
        var o = ms.getAttribute('data-orig') || '';
        if ((ms.value || '') !== o){
          rowObj.milestone = ms.value || '';
          hasChange = true;
        }
      }
      if (as){
        var ao = as.getAttribute('data-orig') || '';
        if ((as.value || '') !== ao){
          rowObj.actionStatus = as.value || '';
          hasChange = true;
        }
      }
      if (ps){
        var po = ps.getAttribute('data-orig') || '';
        if ((ps.value || '') !== po){
          rowObj.projectStatus = ps.value || '';
          hasChange = true;
        }
      }
      if (cs){
        var co = cs.getAttribute('data-orig') || '';
        if ((cs.value || '') !== co){
          rowObj.projectLead = cs.value || '';
          hasChange = true;
        }
      }
      if (pt){
        var pto = pt.getAttribute('data-orig') || 'F';
        var ptn = pt.checked ? 'T' : 'F';
        if (ptn !== pto){
          rowObj.custrecord_projteased = pt.checked;
          hasChange = true;
        }
      }
      if (fi){
        var fio = fi.getAttribute('data-orig') || 'F';
        var fin = fi.checked ? 'T' : 'F';
        if (fin !== fio){
          rowObj.custrecord_firequested = fi.checked;
          hasChange = true;
        }
      }

      if (hasChange) changes[recId] = rowObj;
    }

    for (var noteRecId in NOTE_DRAFTS) {
      if (!NOTE_DRAFTS.hasOwnProperty(noteRecId)) continue;
      var d = NOTE_DRAFTS[noteRecId] || {};
      if (d.add && d.add.length) {
        if (!changes[noteRecId]) changes[noteRecId] = {};
        changes[noteRecId].notes = d;
      }
    }

    return changes;
  }

  function buildFiltersJson(){
    return JSON.stringify({
      project: (document.getElementById('f_project') || {}).value || '',
      sales: (document.getElementById('f_sales') || {}).value || '',
      clients: getMultiSelected(document.getElementById('f_client')),
      owners: getMultiSelected(document.getElementById('f_owner')),
      msFrom: (document.getElementById('f_ms_from') || {}).value || '',
      msTo: (document.getElementById('f_ms_to') || {}).value || ''
    });
  }

  function setMultiSelected(selectEl, values){
    if (!selectEl) return;

    var map = {};
    for (var i = 0; i < values.length; i++){
      map[String(values[i])] = true;
    }

    for (var j = 0; j < selectEl.options.length; j++){
      selectEl.options[j].selected = !!map[String(selectEl.options[j].value)];
    }
  }

  function restoreSavedFilters(){
    var saved = '';

    try {
      saved = sessionStorage.getItem('projectBoardFilters') || '';
    } catch(e) {}

    if (!saved) return;

    try {
      var f = JSON.parse(saved);

      var el = document.getElementById('f_project');
      if (el) el.value = f.project || '';

      el = document.getElementById('f_sales');
      if (el) el.value = f.sales || '';

      el = document.getElementById('f_ms_from');
      if (el) el.value = f.msFrom || '';

      el = document.getElementById('f_ms_to');
      if (el) el.value = f.msTo || '';

      setMultiSelected(document.getElementById('f_client'), f.clients || []);
      setMultiSelected(document.getElementById('f_owner'), f.owners || []);

    } catch(e) {}
  }

  function getNoteTempId(){
    return 'tmp_' + new Date().getTime() + '_' + Math.floor(Math.random() * 100000);
  }

function openNotePopup(recId, tempId, title, memo, mode){
  var popupUrl = NOTE_POPUP_URL
    + '&projectid=' + encodeURIComponent(recId || '')
    + '&tempid=' + encodeURIComponent(tempId || '')
    + '&title=' + encodeURIComponent(title || '')
    + '&memo=' + encodeURIComponent(memo || '')
    + '&mode=' + encodeURIComponent(mode || 'add');

  console.log('Opening note popup', { recId: recId, tempId: tempId, mode: mode });
  window.open(popupUrl, 'project_note_popup_' + (recId || ''), 'width=850,height=650,resizable=yes,scrollbars=yes');
}

  window.receiveProjectNote = function(obj){
    console.log('Received note from popup', obj);
    if (!obj || !obj.recId) return;

    var recId = obj.recId;
    if (!NOTE_DRAFTS[recId]) {
      NOTE_DRAFTS[recId] = { add: [] };
    }

    var tempId = obj.tempId || getNoteTempId();
    obj.tempId = tempId;

    var found = false;
    for (var i = 0; i < NOTE_DRAFTS[recId].add.length; i++) {
      if (NOTE_DRAFTS[recId].add[i].tempId === tempId) {
        NOTE_DRAFTS[recId].add[i] = obj;
        found = true;
        break;
      }
    }

    if (!found) NOTE_DRAFTS[recId].add.push(obj);

    renderNoteDrafts(recId);
    renderChangeBox();
  };

  function renderNoteDrafts(recId){
    var box = document.querySelector('[data-note-box="' + recId + '"]');
    if (!box) return;

    var d = NOTE_DRAFTS[recId];
    if (!d || !d.add || !d.add.length) {
      box.innerHTML = '';
      return;
    }

    var html = '';
    for (var i = 0; i < d.add.length; i++) {
      var n = d.add[i] || {};
      html += '<div class="note-draft-card" data-tempid="' + esc(n.tempId || '') + '">';
      html += '<div class="note-draft-title">' + esc(n.title || '(No Title)') + '</div>';
      html += '<div class="note-draft-memo">' + esc(n.memo || '') + '</div>';
      html += '<button type="button" class="note-action-btn btn-edit-note" data-recid="' + esc(recId) + '" data-tempid="' + esc(n.tempId || '') + '">Edit</button>';
      html += '<button type="button" class="note-action-btn note-remove-btn btn-remove-note" data-recid="' + esc(recId) + '" data-tempid="' + esc(n.tempId || '') + '">Remove</button>';
      html += '</div>';
    }

    box.innerHTML = html;
  }

  function getDraftNote(recId, tempId){
    var d = NOTE_DRAFTS[recId];
    if (!d || !d.add) return null;

    for (var i = 0; i < d.add.length; i++) {
      if (d.add[i].tempId === tempId) return d.add[i];
    }
    return null;
  }

  function doSubmit(){
    var changes = buildChangesJson();
    var keys = Object.keys(changes || {});
    if (!keys.length){
      alert('No changes found.');
      return;
    }
    var hidden = document.getElementById('custpage_changes');
    if (hidden) hidden.value = JSON.stringify(changes);

    try {
      sessionStorage.setItem('projectBoardFilters', buildFiltersJson());
    } catch(e) {}

    var mainForm = document.getElementById('main_form');
    if (mainForm) mainForm.submit();
  }

  function initEditors(){
    var trs = document.querySelectorAll('tr[data-recid]');
    for (var i=0;i<trs.length;i++){
      var tr = trs[i];

      var as = tr.querySelector('select.actionStatus');
      if (as){
        as.value = as.getAttribute('data-orig') || '';
        setSelectColor(as);
      }

      var ps = tr.querySelector('select.projStatus');
      if (ps){
        ps.value = ps.getAttribute('data-orig') || '';
        setProjectStatusColor(ps);
      }

      var cs = tr.querySelector('select.csmSelect');
      if (cs){
        cs.value = cs.getAttribute('data-orig') || '';
      }

      markRowChangedIfNeeded(tr);
    }
    renderChangeBox();
  }

  function getCellBgColor(el){
    try{
      var cs = window.getComputedStyle(el);
      return cs.backgroundColor || '#ffffff';
    }catch(e){
      return '#ffffff';
    }
  }

  function getCellTextColor(el){
    try{
      var cs = window.getComputedStyle(el);
      return cs.color || '#111827';
    }catch(e){
      return '#111827';
    }
  }

  function getBorderColor(el){
    try{
      var cs = window.getComputedStyle(el);
      return cs.borderColor || '#d1d5db';
    }catch(e){
      return '#d1d5db';
    }
  }

  function safeHtml(s){
    s = (s == null ? '' : String(s));
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getDisplayValueFromCell(td){
    if (!td) return '';

    var a = td.querySelector('a');
    if (a) return a.textContent || '';

    var sel = td.querySelector('select');
    if (sel){
      if (!sel.value) return '';
      return (sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].text) || '';
    }

    var inp = td.querySelector('input');
    if (inp) return inp.value || '';

    return td.textContent || '';
  }

  function buildStyledCellHtml(td){
    var value = getDisplayValueFromCell(td);
    var bg = getCellBgColor(td);
    var color = getCellTextColor(td);
    var border = '#dbe3ee';

    var childSel = td.querySelector('select');
    var childInp = td.querySelector('input');

    if (childSel){
      bg = getCellBgColor(childSel);
      color = getCellTextColor(childSel);
      border = getBorderColor(childSel);
    } else if (childInp){
      bg = getCellBgColor(childInp);
      color = getCellTextColor(childInp);
      border = getBorderColor(childInp);
    }

    return '<td style="'
      + 'padding:8px;'
      + 'border:1px solid ' + safeHtml(border) + ';'
      + 'background:' + safeHtml(bg) + ';'
      + 'color:' + safeHtml(color) + ';'
      + 'vertical-align:middle;'
      + 'mso-number-format:\\@;'
      + '">' + safeHtml(value) + '</td>';
  }

  function downloadExcel(){
    var sections = document.querySelectorAll('details.section');
    var html = '';

    html += '<html xmlns:o="urn:schemas-microsoft-com:office:office" '
         + 'xmlns:x="urn:schemas-microsoft-com:office:excel" '
         + 'xmlns="http://www.w3.org/TR/REC-html40">';
    html += '<head>';
    html += '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">';
    html += '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Project Board</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->';
    html += '<style>';
    html += 'body{font-family:Arial,sans-serif;font-size:12px;}';
    html += 'table{border-collapse:collapse;width:100%;margin-bottom:18px;}';
    html += 'th{background:#f8fafc;color:#6b7280;border:1px solid #dbe3ee;padding:8px;text-align:left;font-weight:bold;}';
    html += 'td{border:1px solid #dbe3ee;padding:8px;vertical-align:middle;}';
    html += '.group-title{font-size:16px;font-weight:bold;padding:10px 0 6px 0;}';
    html += '.group-meta{font-size:12px;color:#475569;padding-bottom:6px;}';
    html += '</style>';
    html += '</head><body>';

    html += '<div style="font-size:20px;font-weight:bold;margin-bottom:14px;">Client Project Board</div>';

    for (var s = 0; s < sections.length; s++){
      var sec = sections[s];
      var rows = sec.querySelectorAll('tbody tr[data-recid]');
      var visibleRows = [];

      for (var r = 0; r < rows.length; r++){
        if (rows[r].style.display !== 'none') visibleRows.push(rows[r]);
      }

      if (!visibleRows.length) continue;

      var titleEl = sec.querySelector('.summary-title');
      var metaEl = sec.querySelector('.summary-meta');
      var barEl = sec.querySelector('.summary-bar');

      var grpTitle = titleEl ? (titleEl.textContent || '') : '';
      var grpMeta = metaEl ? (metaEl.textContent || '') : '';
      var grpColor = '#94a3b8';
      try{
        grpColor = window.getComputedStyle(barEl).backgroundColor || '#94a3b8';
      }catch(e){}

      html += '<div class="group-title" style="color:' + safeHtml(grpColor) + ';">' + safeHtml(grpTitle) + '</div>';
      html += '<div class="group-meta">' + safeHtml(grpMeta) + '</div>';

      var table = sec.querySelector('table.board');
      var theadRows = table.querySelectorAll('thead tr');

      html += '<table>';

      for (var trh = 0; trh < theadRows.length; trh++){
        var ths = theadRows[trh].querySelectorAll('th');
        html += '<tr>';
        for (var thi = 0; thi < ths.length; thi++){
          // Strip the sort arrow text from export
          var thText = ths[thi].cloneNode(true);
          var arrow = thText.querySelector('.sort-arrow');
          if (arrow) arrow.remove();
          html += '<th>' + safeHtml(thText.textContent || '') + '</th>';
        }
        html += '</tr>';
      }

      for (var vr = 0; vr < visibleRows.length; vr++){
        var tr = visibleRows[vr];
        var tds = tr.querySelectorAll('td');
        html += '<tr>';

        for (var c = 0; c < tds.length; c++){
          html += buildStyledCellHtml(tds[c]);
        }

        html += '</tr>';
      }

      html += '</table><br/>';
    }

    html += '</body></html>';

    var blob = new Blob([html], {
      type: 'application/vnd.ms-excel;charset=utf-8;'
    });

    var link = document.createElement('a');
    var fileName = 'Client_Project_Board_' + new Date().getTime() + '.xls';

    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(function(){
      URL.revokeObjectURL(link.href);
    }, 1000);
  }

  /* ── Column sorting (per-section) ── */
  function getCellSortValue(td, type){
    if (!td) return '';
    var sel = td.querySelector('select');
    if (sel){
      if (!sel.value) return '';
      return (sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].text) || '';
    }
    var inp = td.querySelector('input');
    if (inp) return inp.value || '';
    var a = td.querySelector('a');
    if (a) return a.textContent || '';
    return td.textContent || '';
  }

  function sortTableByColumn(table, colIndex, type, dir){
    var tbody = table.querySelector('tbody');
    if (!tbody) return;

    var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr[data-recid]'));

    rows.sort(function(a,b){
      var av = getCellSortValue(a.children[colIndex], type);
      var bv = getCellSortValue(b.children[colIndex], type);

      if (type === 'date'){
        av = av ? new Date(av).getTime() : 0;
        bv = bv ? new Date(bv).getTime() : 0;
      } else {
        av = String(av || '').toLowerCase();
        bv = String(bv || '').toLowerCase();
      }

      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });

    for (var i=0;i<rows.length;i++){
      tbody.appendChild(rows[i]);
    }
  }

  function initColumnSorting(){
    var sections = document.querySelectorAll('details.section');

    for (var s=0;s<sections.length;s++){
      var table = sections[s].querySelector('table.board');
      if (!table) continue;

      var headers = table.querySelectorAll('th[data-sort-col]');
      for (var h=0;h<headers.length;h++){
        (function(th, tbl){
          th.addEventListener('click', function(){
            var colIndex = parseInt(th.getAttribute('data-sort-col'), 10);
            var type = th.getAttribute('data-sort-type') || 'text';
            var currentDir = th.getAttribute('data-sort-dir') || '';
            var nextDir = (currentDir === 'asc') ? 'desc' : 'asc';

            var allHeads = tbl.querySelectorAll('th[data-sort-col]');
            for (var x=0;x<allHeads.length;x++){
              allHeads[x].setAttribute('data-sort-dir', '');
              allHeads[x].classList.remove('sorted-asc');
              allHeads[x].classList.remove('sorted-desc');
              var ar = allHeads[x].querySelector('.sort-arrow');
              if (ar) ar.textContent = '⇅';
            }

            th.setAttribute('data-sort-dir', nextDir);
            th.classList.add(nextDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
            var arrow = th.querySelector('.sort-arrow');
            if (arrow) arrow.textContent = nextDir === 'asc' ? '↑' : '↓';

            sortTableByColumn(tbl, colIndex, type, nextDir);
          });
        })(headers[h], table);
      }
    }
  }

  function getMultiSelected(selectEl){
    var out = [];
    if (!selectEl) return out;
    for (var i=0;i<selectEl.options.length;i++){
      if (selectEl.options[i].selected) out.push(selectEl.options[i].value);
    }
    return out;
  }

  function containsAny(value, arr){
    if (!arr || !arr.length) return true;
    value = norm(value);
    for (var i=0;i<arr.length;i++){
      if (value === norm(arr[i])) return true;
    }
    return false;
  }

  function applyFilters(){
    var fProject = norm((document.getElementById('f_project') || {}).value || '');
    var fClients = getMultiSelected(document.getElementById('f_client'));
    var fOwners = getMultiSelected(document.getElementById('f_owner'));
    var fSales = norm((document.getElementById('f_sales') || {}).value || '');
    var fromVal = (document.getElementById('f_ms_from') || {}).value || '';
    var toVal = (document.getElementById('f_ms_to') || {}).value || '';

    var fromDate = ymdToDate(fromVal);
    var toDate = ymdToDate(toVal);
    if (fromDate) fromDate = stripTime(fromDate);
    if (toDate) toDate = stripTime(toDate);

    var countsByGroup = {};
    var rows = document.querySelectorAll('tr[data-recid]');

    for (var i=0;i<rows.length;i++){
      var tr = rows[i];
      var show = true;

      var recId = norm(tr.getAttribute('data-recid') || '');
      var client = norm(tr.getAttribute('data-client') || '');
      var owner = norm(tr.getAttribute('data-owner') || '');
      var sales = norm(tr.getAttribute('data-sales') || '');
      var ms = norm(tr.getAttribute('data-msdate') || '');
      var group = tr.getAttribute('data-group') || '';

      if (fProject && recId !== fProject) show = false;
      if (show && !containsAny(client, fClients)) show = false;
      if (show && !containsAny(owner, fOwners)) show = false;
      if (show && fSales && sales !== fSales) show = false;

      if (show && (fromDate || toDate)){
        var rowDate = ymdToDate(ms);
        if (!rowDate) show = false;
        else {
          rowDate = stripTime(rowDate);
          if (fromDate && rowDate < fromDate) show = false;
          if (toDate && rowDate > toDate) show = false;
        }
      }

      tr.style.display = show ? '' : 'none';

      if (show){
        if (!countsByGroup[group]) countsByGroup[group] = 0;
        countsByGroup[group]++;
      }
    }

    var metas = document.querySelectorAll('[data-count-for]');
    for (var m=0;m<metas.length;m++){
      var g = metas[m].getAttribute('data-count-for') || '';
      var cnt = countsByGroup[g] || 0;
      metas[m].textContent = (cnt === 1 ? '1 project' : (cnt + ' projects'));

      var sec = document.getElementById('sec_' + g);
      if (sec) sec.style.display = '';
    }
  }

  function clearFilters(){
    var ids = ['f_project','f_sales','f_ms_from','f_ms_to'];
    for (var i=0;i<ids.length;i++){
      var el = document.getElementById(ids[i]);
      if (el) el.value = '';
    }

    var multiIds = ['f_client','f_owner'];
    for (var m=0;m<multiIds.length;m++){
      var sel = document.getElementById(multiIds[m]);
      if (!sel) continue;
      for (var x=0;x<sel.options.length;x++) sel.options[x].selected = false;
    }

    try {
      sessionStorage.removeItem('projectBoardFilters');
    } catch(e) {}

    applyFilters();
  }

  function resetChanges(){
    var trs = document.querySelectorAll('tr[data-recid]');
    for (var i=0;i<trs.length;i++){
      var tr = trs[i];
      var ms = tr.querySelector('input.milestone');
      var as = tr.querySelector('select.actionStatus');
      var ps = tr.querySelector('select.projStatus');
      var cs = tr.querySelector('select.csmSelect');
      var pt = tr.querySelector('input.chk-projteased');
      var fi = tr.querySelector('input.chk-firequested');

      if (ms) ms.value = ms.getAttribute('data-orig') || '';
      if (as){
        as.value = as.getAttribute('data-orig') || '';
        setSelectColor(as);
      }
      if (ps){
        ps.value = ps.getAttribute('data-orig') || '';
        setProjectStatusColor(ps);
      }
      if (cs){
        cs.value = cs.getAttribute('data-orig') || '';
      }
      if (pt){
        pt.checked = ((pt.getAttribute('data-orig') || 'F') === 'T');
      }
      if (fi){
        fi.checked = ((fi.getAttribute('data-orig') || 'F') === 'T');
      }
      markRowChangedIfNeeded(tr);
    }

    NOTE_DRAFTS = {};
    var boxes = document.querySelectorAll('.note-draft-list');
    for (var b=0;b<boxes.length;b++) boxes[b].innerHTML = '';

    renderChangeBox();
  }

  function bindEvents(){
    var submitBtn = document.getElementById('custpage_custom_submit');
    if (submitBtn) submitBtn.addEventListener('click', doSubmit);

    var resetBtn = document.getElementById('btn_reset_changes');
    if (resetBtn) resetBtn.addEventListener('click', resetChanges);

    var excelBtn = document.getElementById('btn_download_excel');
    if (excelBtn) excelBtn.addEventListener('click', downloadExcel);

    var clearBtn = document.getElementById('btn_clear_filters');
    if (clearBtn) clearBtn.addEventListener('click', clearFilters);

    var expandBtn = document.getElementById('btn_expand_all');
    if (expandBtn) expandBtn.addEventListener('click', function(){
      var secs = document.querySelectorAll('details.section');
      for (var i=0;i<secs.length;i++) secs[i].open = true;
    });

    var closeBtn = document.getElementById('btn_close_all');
    if (closeBtn) closeBtn.addEventListener('click', function(){
      var secs = document.querySelectorAll('details.section');
      for (var i=0;i<secs.length;i++) secs[i].open = false;
    });

    var editorEls = document.querySelectorAll('.edit, .chk-projteased, .chk-firequested');
    for (var e=0;e<editorEls.length;e++){
      editorEls[e].addEventListener('change', function(){
        var tr = this.closest('tr[data-recid]');
        if (this.classList.contains('actionStatus')) setSelectColor(this);
        if (this.classList.contains('projStatus')) setProjectStatusColor(this);
        markRowChangedIfNeeded(tr);
        renderChangeBox();
      });
    }

    var filterEls = document.querySelectorAll('#f_project, #f_client, #f_owner, #f_sales, #f_ms_from, #f_ms_to');
    for (var f=0;f<filterEls.length;f++){
      filterEls[f].addEventListener('change', applyFilters);
    }

    document.addEventListener('click', function(e){
      var addBtn = e.target.closest('.btn-add-note');
      if (addBtn){
        openNotePopup(addBtn.getAttribute('data-recid') || '', getNoteTempId(), '', '', 'add');
        return;
      }

      var viewBtn = e.target.closest('.btn-view-note');
      if (viewBtn){
        var recId = viewBtn.getAttribute('data-recid') || '';
        var popupUrl = NOTE_POPUP_URL + '&projectid=' + encodeURIComponent(recId) + '&mode=view';
        window.open(popupUrl, 'project_note_view_' + recId, 'width=950,height=700,resizable=yes,scrollbars=yes');
        return;
      }

      var editBtn = e.target.closest('.btn-edit-note');
      if (editBtn){
        var er = editBtn.getAttribute('data-recid') || '';
        var et = editBtn.getAttribute('data-tempid') || '';
        var note = getDraftNote(er, et) || {};
        openNotePopup(er, et, note.title || '', note.memo || '', 'edit');
        return;
      }

      var remBtn = e.target.closest('.btn-remove-note');
      if (remBtn){
        var rr = remBtn.getAttribute('data-recid') || '';
        var rt = remBtn.getAttribute('data-tempid') || '';
        var d = NOTE_DRAFTS[rr];
        if (d && d.add){
          var newArr = [];
          for (var ni=0;ni<d.add.length;ni++){
            if (d.add[ni].tempId !== rt) newArr.push(d.add[ni]);
          }
          d.add = newArr;
        }
        renderNoteDrafts(rr);
        renderChangeBox();
        return;
      }
    });
  }

  restoreSavedFilters();
  initEditors();
  bindEvents();
  bindPlainDropdownOnWindows();
  initIOSDropdowns();
  initColumnSorting();
  applyFilters();
})();
</script>
      `;

      var inline = form.addField({
        id: 'custpage_inline_html',
        type: ui.FieldType.INLINEHTML,
        label: 'html'
      });
      inline.defaultValue = html;

      context.response.writePage(form);
    }

    return { onRequest: onRequest };
  });
