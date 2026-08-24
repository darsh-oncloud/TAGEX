/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/ui/serverWidget', 'N/url', 'N/runtime', 'N/record', 'N/search', 'N/https', 'N/log', 'N/email'], (serverWidget, url, runtime, record, search, https, log, email) => {

    const INTERNAL_EMAIL_ID = 297744;
    const OPP_REC_BASE_URL = 'https://5406208.app.netsuite.com/app/accounting/transactions/opprtnty.nl?id=';
  
    function createOpportunity(data) {
        try {
            const externalId = data.firstname + ' ' + data.lastname + '_' + new Date();

            var scriptParams = getScriptParams();
            log.debug('Incoming Default Params', scriptParams);
          
            const OPPORTUNITY_FORM = 245;
            const customerName = data.firstname + ' ' + data.lastname;
            const oppTitle = data.sku ? scriptParams.oppTitle + ': [' + data.sku + ']' + '-' + customerName : scriptParams.oppTitle;
            const salesChannel = scriptParams.salesChannel;
            const shopifyPriceLevel = 6;

            data.entitystatus = scriptParams.entityStatus;
            data.probability = scriptParams.probability;
            data.department = scriptParams.department;
            data.entity = data.firstname;

            // -------------------------
            // 1. Check existing Opportunity via externalId
            // -------------------------
            // let oppId = findOpportunityByExternalId(externalId);
            let oppId = '';

            let oppRec;

            if (oppId) {
                // -------------------------
                // 2. UPDATE Opportunity
                // -------------------------
                log.debug("Updating existing Opportunity", { externalId, oppId });

                oppRec = record.load({
                    type: record.Type.OPPORTUNITY,
                    id: oppId,
                    isDynamic: true
                });

            } else {
                // -------------------------
                // 3. CREATE New Opportunity
                // -------------------------
                log.debug("Creating new Opportunity", { externalId });

                oppRec = record.create({
                    type: record.Type.OPPORTUNITY,
                    isDynamic: true
                });

                oppRec.setValue('externalid', externalId);
            }

            // -------------------------
            // 4. Set fields (from request body)
            // -------------------------
            if (data.entity) {
              try {
                const entityId = findEntityIdByName(data);
                data.customerId = entityId;
                
                log.debug('entityId',data.customerId);

                if (!entityId) {
                  sendEmailNotification(data, 'duplicate', null);
                  return;
                }
                
                if (entityId) oppRec.setValue('entity', entityId);  
              } catch (error) {
                sendEmailNotification(data, 'duplicate', null, error)
                log.debug('Error getting customer', error);
              }
            }

            if (data.entitystatus) {
                const entityStatusId = findStatusIdByName(data.entitystatus);

                if (entityStatusId) oppRec.setValue('entitystatus', entityStatusId);
            }

            oppRec.setValue('customform', OPPORTUNITY_FORM);
            oppRec.setValue('title', oppTitle);
            oppRec.setValue('class', salesChannel);
          
            if (data.expectedclosedate) oppRec.setValue('expectedclosedate', new Date());

            if (data.probability) oppRec.setValue('probability', data.probability);

            if (data.message) oppRec.setValue('memo', data.message);

            if (data.price) {
                oppRec.setValue('projectedtotal', data.price);
            } else {
                oppRec.setValue('projectedtotal', 0);
            }

            // --------------------------------------------------
            // 5. Line items
            // --------------------------------------------------
            if (data.item) {
              const itemObj = findItemIdByName(data.item);
              const itemId = itemObj.itemId;
              const itemLocation = itemObj.itemLocation;

              log.debug('itemObj', itemObj);

              if (!itemId) {
                 log.debug('Item not found', data.item);
              }

              oppRec.selectNewLine({ sublistId: 'item' });

              oppRec.setCurrentSublistValue({
                   sublistId: 'item',
                   fieldId: 'item',
                   value: itemId
              });

              oppRec.setCurrentSublistValue({
                   sublistId: 'item',
                   fieldId: 'quantity',
                   value: 1
              });

              oppRec.setCurrentSublistValue({
                   sublistId: 'item',
                   fieldId: 'rate',
                   value: data.price ? data.price : 0
              });

              try {
                oppRec.setCurrentSublistValue({
                   sublistId: 'item',
                   fieldId: 'price',
                   value: shopifyPriceLevel
                });  
              } catch (error) {
                log.debug('error in setting pricelevel', error);
              }

              if (itemLocation) {
                 oppRec.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'location',
                    value: itemLocation
                 });

                 oppRec.setValue('location', itemLocation);
              }

              oppRec.setCurrentSublistValue({
                 sublistId: 'item',
                 fieldId: 'department',
                 value: data.department || 12
              });

              oppRec.commitLine({ sublistId: 'item' });
            }

            log.debug('oppRec', oppRec);

            // -------------------------
            // 6. Save
            // -------------------------
            const savedId = oppRec.save({ ignoreMandatoryFields: true });
            log.debug('savedId', savedId);

            if (savedId) {
              sendEmailNotification(data, 'success', savedId);
            }

            return {
                success: true,
                message: oppId ? "Opportunity updated" : "Opportunity created",
                internalId: savedId
            };

        } catch (e) {
            log.error("Opportunity creation Error", e.toString());
            sendEmailNotification(data, 'failed', null, e);
            return { success: false, error: e.message };
        }
    }

    function onRequest(context) {
        const req = context.request;
        const res = context.response;

        if ((req.parameters.mode || '') === 'bg') {
            try {
                const data = parsePayloadBG(req);
                log.debug('Full request param', data);
              
                const result = createOpportunity(data);
                res.write('ok');
            } catch (e) {
                log.error('Opportunity creation failed', e);
                res.write(JSON.stringify({ success: false, error: e.message }));
            }
            return;
        }

        if (req.method === 'GET') {
            try {
                const form = serverWidget.createForm({ title: '&nbsp;' });

                const htmlField = form.addField({
                    id: 'custpage_custom_html',
                    type: serverWidget.FieldType.INLINEHTML,
                    label: 'HTML'
                });

                const slUrl = url.resolveScript({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    returnExternalUrl: true
                });

                let itemName = '';
                let itemPrice = 0;
                let itemSKU = '';

                try {
                    var params = req.parameters;

                    log.debug('params', params);

                    itemName = params['?selectedProduct'] ? params['?selectedProduct'] : '';
                    itemPrice = params.selectedPrice ? params.selectedPrice : 0;
                    itemSKU = params.sku ? params.sku : 0;

                    if (itemSKU) {
                        itemPrice = parseFloat(itemPrice) / 100;
                    }

                } catch (error) {
                    log.debug('error setting product name');
                }

                htmlField.defaultValue = `
        <style>
            html, body {
                margin: 0 !important;
                padding: 0 !important;
                min-height: 100vh;
                box-sizing: border-box;
            }
            .form-wrapper { 
                display:flex; 
                justify-content:center; 
                align-items: flex-start; 
                padding:0; 
                margin: 0; 
                box-sizing:border-box; 
            }
            .contact-form-container { 
                width:100%; 
                max-width:450px; 
                background:#fff; 
                padding:20px 25px; 
                border-radius:10px; 
                position:relative; 
            }
            .contact-form { 
                display:flex; 
                flex-direction:column; 
                font-size: 13px; 
            }
            .form-group:first-child { margin-top: 0; }
            .form-group { 
                display:flex; 
                flex-direction:column; 
                margin-bottom:12px; 
                width:100%; 
            }
            .form-group label { 
                margin-bottom:5px; 
                font-weight:bold; 
                font-size: 14px; 
            }
            .form-group input, 
            .form-group textarea {
                padding: 10px; 
                font-size: 14px; 
                border-radius: 4px; 
                border: 1px solid #ccc;
                width: 100%; 
                height: 44px; 
                box-sizing: border-box;
            }
            textarea { height: 80px; resize: vertical; }
            .spinner {
                border: 8px solid #f3f3f3; 
                border-top: 8px solid #3498db;
                border-radius: 50%; 
                width: 50px; 
                height: 50px; 
                animation: spin 1s linear infinite;
                position: absolute; 
                top: 50%; 
                left: 50%; 
                margin-top: -25px; 
                margin-left: -25px;
            }
            @keyframes spin { 
            0% { transform: rotate(0deg); } 
            100% { transform: rotate(360deg); } 
            }
            .loader-hidden { display: none; }
            .loader-visible {
                display: block; 
                position: fixed; 
                top: 0; 
                left: 0; 
                width: 100%; 
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5); 
                z-index: 9999;
            }
            .hidden-element {
                display: none;
            }
            button {
                padding: 14px; 
                font-size: 14px; 
                border-radius: 6px; 
                border: none;
                background: linear-gradient(135deg, #0b3d91, #072b66); 
                color: #fff; 
                cursor: pointer; 
                width: 100%;
                text-align: center; 
                font-weight: 600; 
                transition: background 0.2s ease-in-out, transform 0.1s;
            }
            button:hover { 
                background: linear-gradient(135deg, #0a357d, #051f4d); 
                transform: translateY(-1px); 
            }
            button:active { transform: translateY(1px); }
            #msg { 
                text-align:center; 
                margin-top:15px; 
                font-size:14px; 
                font-weight:600; 
            }
            input:read-only {
               background-color: #f0f0f0;
               border: none;
               color: #333;
               cursor: default;
            }
        </style>

        <div class="form-wrapper">
            <div class="contact-form-container">
            <form id="inquiryForm" class="contact-form">
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
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <input 
                   type="tel" 
                   id="custpage_phone_country" 
                   name="custpage_phone_country" 
                   placeholder="+1" 
                   maxlength="4" 
                   value="+1"
                   pattern="^\+?[0-9]{1,3}$"
                   required 
                   style="width: 60px;" 
                  />
                <input type="tel" id="custpage_phone_area" name="custpage_phone_area" placeholder="Area" maxlength="5" required pattern="^[0-9]{2,5}$" style="width: 70px;" />
                <input type="tel" id="custpage_phone_number" name="custpage_phone_number" placeholder="1234567" maxlength="10" pattern="^[0-9]{5,10}$" required style="flex: 1;" />
                <input type="tel" id="custpage_phone_ext" name="custpage_phone_ext" placeholder="Ext" maxlength="6" style="width: 80px;" />
              </div>
              </div>
                <div class="form-group">
                    <label>Item Name *</label>
                    <input type="text" name="custpage_item_name" value="${itemName}" required readonly>
                </div>
                <div class="form-group">
                    <label>Message</label>
                    <textarea name="custpage_message" rows="3"></textarea>
                </div>
                <div class="form-group hidden-element">
                    <label>Item Price</label>
                    <input type="text" name="custpage_item_price" value="${itemPrice}" readonly>
                </div>
                <div class="form-group hidden-element">
                    <label>Item SKU</label>
                    <input type="text" name="custpage_item_sku" value="${itemSKU}" readonly>
                </div>
                <button type="submit">Submit Inquiry</button>
            </form>
            <div id="msg"></div>
            </div>
        </div>

        <div id="loader" class="loader-hidden">
            <div class="spinner"></div>
        </div>       
      `;

                res.writePage(form);
                return;
            } catch (error) {
                log.debug('error', error);
            }
        }

        if (req.method === 'POST') {
            try {
                const phoneCountryCode = req.parameters.custpage_phone_country;
                const phoneAreaCode = req.parameters.custpage_phone_area;
                const phoneNumber = req.parameters.custpage_phone_number;

                var phoneNum = '';

                log.debug('phone', {
                    phoneCountryCode: phoneCountryCode,
                    phoneAreaCode: phoneAreaCode,
                    phoneNumber: phoneNumber
                });

                if (phoneCountryCode && phoneAreaCode && phoneNumber) {
                    phoneNum = phoneCountryCode + phoneAreaCode + phoneNumber;
                }

                const payload = {
                    firstname: req.parameters.custpage_firstname,
                    lastname: req.parameters.custpage_lastname,
                    email: req.parameters.custpage_email,
                    item: req.parameters.custpage_item_name,
                    price: req.parameters.custpage_item_price || 0,
                    quantity: req.parameters.custpage_qty || '',
                    message: req.parameters.custpage_message,
                    sku: req.parameters.custpage_item_sku,
                    phone: phoneNum,
                };

                log.debug('payload', payload);

                var bgUrl = slUrl('mode=bg');
                var qs = Object.keys(payload)
                    .map(function (k) {
                        return encodeURIComponent(k) + '=' + encodeURIComponent(payload[k] || '');
                    })
                    .join('&');

                var html = `
                    <!doctype html>
                    <html lang="en">
                    <head>
                        <meta charset="utf-8">
                        <title>Thank You</title>
                    </head>
                    <body style="font-family: Arial, sans-serif; background-color: #f9f9f9;">
                        <script>
                            (function() {
                                var url = ${JSON.stringify(bgUrl)};
                                var payload = ${JSON.stringify(payload)};
                                try {
                                    if (navigator.sendBeacon) {
                                        var blob = new Blob([JSON.stringify(payload)], {type: "application/json"});
                                        navigator.sendBeacon(url, blob);
                                    } else if (window.fetch) {
                                        fetch(url, {
                                            method: "POST",
                                            headers: {"Content-Type": "application/json"},
                                            body: JSON.stringify(payload)
                                        });
                                    }
                                } catch(e) {}
                            })();
                        </script>
                        <noscript>
                            <img src="${esc(bgUrl + (bgUrl.indexOf("?") === -1 ? "?" : "&") + qs)}" width="1" height="1" alt="">
                        </noscript>
        
                        <div style="text-align: center; margin-top: 100px;">
                            <h2 style="color: #2e7d32;">Thank you for contacting us!</h2>
                            <p style="font-size: 16px; color: #555;">We have received your request and will get back to you soon.</p>
                        </div>
                    </body>
                    </html>
                `;

                res.write(html);
                return;
            } catch (e) {
                log.error('POST processing failed', e);
                res.write(JSON.stringify({ status: 'failed', error: e.message }));
            }
            return;
        }
    }

    function esc(s) { s = (s == null ? '' : String(s)); return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

    function parsePayloadBG(request) {
        try { if (request.body) return JSON.parse(request.body); } catch (e) { }
        return Object.assign({}, request.parameters);
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

    // -------------------------------------
    // Helper: find via externalId
    // -------------------------------------
    function findOpportunityByExternalId(externalId) {
        const searchObj = search.create({
            type: search.Type.OPPORTUNITY,
            filters: [
                ['externalid', 'is', externalId]
            ],
            columns: ['internalid']
        });

        const result = searchObj.run().getRange({ start: 0, end: 1 });

        return result.length ? result[0].getValue('internalid') : null;
    }

    function findEntityIdByName(data) {
        try {
            const companyName = data.firstname + ' ' + data.lastname;
            log.debug('email', data.email);
            log.debug('company name', companyName);
            
            var entityId;
            search.create({
                type: search.Type.CUSTOMER,
                filters: [
                  ["entityid","is", companyName], 
                   "AND", 
                  ["email","is", data.email]
                ],
                columns: ['internalid']
            }).run().each(function (result) {
                entityId = result.getValue('internalid');

                log.debug('customer found', entityId);
                return false;
            });

            if (!entityId) {
                var customerRec = record.create({
                    type: record.Type.CUSTOMER,
                    isDynamic: true
                });

                customerRec.setValue({ fieldId: 'companyname', value: companyName });
                customerRec.setValue({ fieldId: 'firstname', value: data.firstname || '' });
                customerRec.setValue({ fieldId: 'lastname', value: data.lastname || '' });
                customerRec.setValue({ fieldId: 'email', value: data.email || '' });
                customerRec.setValue({ fieldId: 'phone', value: data.phone || '' });
                customerRec.setValue({ fieldId: 'custentity_ns_tx_customer', value: true });

              

                 entityId = customerRec.save({ enableSourcing: true, ignoreMandatoryFields: true });
                log.audit('New customer created', companyName);

                return entityId;
            }

            return entityId;
        } catch (error) {
            log.debug('error in customer', error);
        }
    }

    function findStatusIdByName(status) {
        log.debug('status', status);
        var statusId;
        search.create({
            type: 'customerstatus',
            filters: [['name', 'is', status]],
            columns: ['internalid']
        }).run().each(function (result) {
            statusId = result.getValue('internalid');
            return false;
        });
        return statusId;
    }

    function findItemIdByName(name) {
        let itemObj = {};

        const searchObj = search.create({
            type: search.Type.ITEM,
            filters: [
                ['displayname', 'is', name]
            ],
            columns: ['internalid', 'inventorylocation']
        });

        const result = searchObj.run().getRange({ start: 0, end: 1 });

        if (result.length) {
            itemObj.itemId = result[0].getValue('internalid');
            itemObj.itemLocation = result[0].getValue('inventorylocation');
        }

        return itemObj;
    }

    function findLocationIdByName(locationName) {
        var upperName = locationName.toUpperCase();
        var isConsCase = upperName.includes('CONS');
        const cleanedInput = locationName.replace(/_/g, ' ').trim().toLowerCase();

        var filters;

        if (isConsCase) {
            filters = [
                ["name", "contains", locationName]
            ];
        } else {
            filters = [
                ["name", "doesnotstartwith", 'East Region : CONS'],
                "AND",
                ["name", "contains", locationName]
            ];
        }

        var id = null;
        let locations = [];
        let bestMatch = { score: -1, id: null };

        search.create({
            type: "location",
            filters: filters,
            columns: [
                "internalid",
                "name",
                search.createColumn({
                    name: "formulatext",
                    formula: "{namenohierarchy}",
                    label: "LocationChild"
                })
            ]
        }).run().each(function (result) {
            id = result.getValue("internalid");
            const name = result.getValue("name");
            const childName = result.getValue({
                name: "formulatext",
                formula: "{namenohierarchy}"
            });

            const childLower = childName.toLowerCase();
            let score = 0;

            if (childLower === cleanedInput) {
                score = 3; // exact match
            } else if (childLower.startsWith(cleanedInput)) {
                score = 2; // starts with
            } else if (childLower.includes(cleanedInput)) {
                score = 1; // contains
            }

            if (score > bestMatch.score) {
                bestMatch = { score: score, id: id };
            }

            return true;
        });

        return bestMatch.id;
    }

    function findDepartmentIdByName(department) {
        var departmentId;
        search.create({
            type: 'department',
            filters: [['name', 'is', department]],
            columns: ['internalid']
        }).run().each(function (result) {
            departmentId = result.getValue('internalid');
            return false;
        });
        return departmentId;
    }

    function getScriptParams() {
        let script = runtime.getCurrentScript();

        return {
            entityStatus: script.getParameter({ name: 'custscript_opportunity_status' }),
            probability: script.getParameter({ name: 'custscript_default_opportunity_prob' }),
            department: script.getParameter({ name: 'custscript_department_opp' }),
            oppTitle: script.getParameter({ name: 'custscript_title_opp' }),
            salesChannel: script.getParameter({ name: 'custscript_sales_channel' }),
        };
    }

    function getAllParams(request) {
    var fullURL = request.parameters.fullURL;
    if (!fullURL) return {};

    var params = {};

    try {
        // Extract the query string after '?'
        var qIndex = fullURL.indexOf('?');
        if (qIndex === -1) return {};

        var queryString = fullURL.substring(qIndex + 1);

        // Split into key=value pairs
        var pairs = queryString.split('&');

        pairs.forEach(function(pair) {
            var parts = pair.split('=');
            var key = parts[0];
            var value = parts[1] ? decodeURIComponent(parts[1]) : '';

            params[key] = value;
        });

    } catch (e) {
        log.error('Error parsing fullURL params', e);
    }

    return params;
  }

    function sendEmailNotification(details, status, oppId, error) {
        if (!details.email) return;

        var subject = '';
        var body = '';

        var infoBlock = `
            <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>First Name:</strong></td>
                <td style="padding: 8px; border: 1px solid #ddd;">${details.firstname || '-'}</td>
                </tr>
                <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>Last Name:</strong></td>
                <td style="padding: 8px; border: 1px solid #ddd;">${details.lastname || '-'}</td>
                </tr>
                <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>Phone Number:</strong></td>
                <td style="padding: 8px; border: 1px solid #ddd;">${details.phone || '-'}</td>
                </tr>
                <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>Email:</strong></td>
                <td style="padding: 8px; border: 1px solid #ddd;">${details.email || '-'}</td>
                </tr>
                <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>Item:</strong></td>
                <td style="padding: 8px; border: 1px solid #ddd;">${details.item || '-'}</td>
                </tr>
                <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>Price:</strong></td>
                <td style="padding: 8px; border: 1px solid #ddd;">${'$' + details.price || '-'}</td>
                </tr>
                <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>Message:</strong></td>
                <td style="padding: 8px; border: 1px solid #ddd;">${details.message || '-'}</td>
                </tr>
                <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>SKU:</strong></td>
                <td style="padding: 8px; border: 1px solid #ddd;">${details.sku || '-'}</td>
                </tr>
            </table>
        `;

        switch (status) {
            case 'success':
                subject = `Inventory Opportunity Created: ${details.firstname} ${details.lastname}`;
                body = `
                <p>A new Inventory opportunity has been created successfully in NetSuite.</p>
                ${infoBlock}
                ${oppId ? `<p><strong>Opportunity Record: </strong> <a href="${OPP_REC_BASE_URL + oppId}" target="_blank">Click Here</a></p>` : ''}
            `;

                break;

            case 'duplicate':
                subject = `A customer record with this ID already exists. You must enter a unique customer ID for each record you create: ${details.firstname} ${details.lastname}`;
                body = `
                <p>A opportunity submission was attempted, but a duplicate customer already exists in NetSuite.</p>
                ${infoBlock} 
            `;

                break;

            case 'failed':
                subject = `Inventory Opportunity Creation Failed: ${details.firstname} ${details.lastname}`;
                body = `
                <p>There was an error creating a opportunity in NetSuite. Please review the details below and take action as needed.</p>
                ${infoBlock}
                <p><strong>Error Details:</strong> ${error && error.message ? error.message : 'Unknown error'}</p>
            `;

                break;
        }

        log.debug('details.customerId', details.customerId);

        try {
            if (details.customerId) {
              
              email.send({
                 author: INTERNAL_EMAIL_ID,
                 recipients: ['leads@tagexbrands.com'],
                 subject: subject,
                 body: body,
                 relatedRecords: { entityId: details.customerId },
                 isInternalOnly: false
              });
              
              log.audit('Email sent to ' + details.email, subject);
            } else {
              email.send({
                 author: INTERNAL_EMAIL_ID,
                 recipients: ['leads@tagexbrands.com'],
                 subject: subject,
                 body: body,
                 isInternalOnly: false
              });
              
              log.audit('Email sent to ' + details.email, subject);
            }
        } catch (mailErr) {
            log.error('Email send failed', mailErr);
        }
    }

    return { onRequest };
});
