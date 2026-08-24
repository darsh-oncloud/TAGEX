/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/ui/serverWidget', 'N/email', 'N/runtime'], (ui, email, runtime) => {

  const onRequest = (context) => {
    if (context.request.method === 'GET') {
      const form = ui.createForm({ title: '&nbsp;' });

      const htmlField = form.addField({
        id: 'custpage_contactform',
        type: ui.FieldType.INLINEHTML,
        label: 'Form'
      });

      htmlField.defaultValue = `
        <style>
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            min-height: 100vh;
            box-sizing: border-box;
          }
          .form-wrapper { display:flex; justify-content:center; align-items: flex-start; padding:0; margin: 0; box-sizing:border-box; }
          .contact-form-container { width:100%; max-width:450px; background:#fff; padding:20px 25px; border-radius:10px; position:relative; }
          .contact-form { display:flex; flex-direction:column; font-size: 13px; }
          .form-group:first-child { margin-top: 0; }
          .form-group { display:flex; flex-direction:column; margin-bottom:12px; width:100%; }
          .form-group label { margin-bottom:5px; font-weight:bold; font-size: 14px; }
          .form-group input, .form-group select {
            padding: 10px; font-size: 14px; border-radius: 4px; border: 1px solid #ccc;
            width: 100%; height: 44px; box-sizing: border-box;
          }
          .spinner {
            border: 8px solid #f3f3f3; border-top: 8px solid #3498db;
            border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite;
            position: absolute; top: 50%; left: 50%; margin-top: -25px; margin-left: -25px;
          }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          .loader-hidden { display: none; }
          .loader-visible {
              display: block; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
              background-color: rgba(0, 0, 0, 0.5); z-index: 9999;
          }
          button {
            padding: 14px; font-size: 14px; border-radius: 6px; border: none;
            background: linear-gradient(135deg, #0b3d91, #072b66); color: #fff; cursor: pointer; width: 100%;
            text-align: center; font-weight: 600; transition: background 0.2s ease-in-out, transform 0.1s;
          }
          button:hover { background: linear-gradient(135deg, #0a357d, #051f4d); transform: translateY(-1px); }
          button:active { transform: translateY(1px); }
        </style>

        <div class="form-wrapper">
          <div class="contact-form-container">
            <form method="POST" class="contact-form">
              <div class="form-group">
                <label>First Name *</label>
                <input type="text" name="firstname" required>
              </div>
              <div class="form-group">
                <label>Last Name *</label>
                <input type="text" name="lastname" required>
              </div>
              <div class="form-group">
                <label>Email *</label>
                <input type="email" name="email" required>
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
                <label>How Can We Help? *</label>
                <textarea name="help" rows="3"></textarea>
              </div>
              <button type="submit">Submit</button>
            </form>
          </div>
        </div>
      `;

      context.response.writePage(form);
    } else {
      const req = context.request;
      const firstName = req.parameters.firstname;
      const lastName = req.parameters.lastname;
      const emailAddr = req.parameters.email;
      const phoneCountryCode = req.parameters.custpage_phone_country;
      const phoneAreaCode = req.parameters.custpage_phone_area;
      const phoneNumber = req.parameters.custpage_phone_number;
      const help = req.parameters.help;

      var phoneNum = '';

      if (phoneCountryCode && phoneAreaCode && phoneNumber) {
        phoneNum = phoneCountryCode + phoneAreaCode + phoneNumber;
      }

      var scriptParams = getScriptParams();
      log.debug('Incoming Default Params', scriptParams);

      // Compose email body
      const emailBody = `
        <h3>New Contact Form Submission</h3>
        <p><b>First Name:</b> ${firstName}</p>
        <p><b>Last Name:</b> ${lastName}</p>
        <p><b>Email:</b> ${emailAddr}</p>
        <p><b>Phone:</b> ${phoneNum}</p>
        <p><b>Help With:</b> ${help}</p>
      `;

      // Send email
      email.send({
        author: 297744,
        recipients: scriptParams.email ? scriptParams.email : 'leads@tagexbrands.com',
        subject: scriptParams.subject ? scriptParams.subject : 'New Website Contact Submission',
        body: emailBody,
        relatedRecords: {}
      });

      // Show thank you message
      const form = ui.createForm({ title: '&nbsp;' });
      form.addField({
        id: 'custpage_message',
        type: ui.FieldType.INLINEHTML,
        label: ' ',
      }).defaultValue = `<div style="font-size:16px; text-align:center; padding:30px;">
        <p>Thank you, <b>${firstName}</b>! Your message has been sent successfully.</p>
        <p>We’ll get back to you shortly.</p>
      </div>`;

      context.response.writePage(form);
    }
  };

  function getScriptParams() {
    let script = runtime.getCurrentScript();

    return {
      email: script.getParameter({ name: 'custscript_tagex_team_email' }),
      subject: script.getParameter({ name: 'custscript_cust_contact_email_subject' }),
    };
  }

  return { onRequest };
});
