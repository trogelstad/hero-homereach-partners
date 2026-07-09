// Hero HomeReach Partners — Partner Review form handler
// Vercel serverless function. Receives the modal form POST from
// /lenders/index.html, upserts the contact into MailerLite and adds
// them to the "Hero HomeReach Partner Reviews" group (created
// automatically on first use if it doesn't exist yet).
//
// Requires one environment variable, set in Vercel's dashboard
// (Project -> Settings -> Environment Variables), NOT in this file:
//   MAILERLITE_API_KEY = <your real MailerLite API key>
//
// Email notification to Trent is intentionally NOT sent from here —
// set up a MailerLite Automation instead (Automations -> New ->
// trigger "Subscriber joins a group" -> group "Hero HomeReach Partner
// Reviews" -> action "Send an email" to yourself). That keeps this
// function simple and reuses the exact tool you already trust for
// the va.herohomereach.com form, instead of adding a second email
// service just for this.

const GROUP_NAME = 'Hero HomeReach Partner Reviews';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.MAILERLITE_API_KEY;
  if (!apiKey) {
    console.error('MAILERLITE_API_KEY is not set in Vercel environment variables.');
    return res.status(500).json({ error: 'Server not configured' });
  }

  const {
    full_name, email, phone, company, market, role,
    audiences, assistance_familiarity, partnership_interest
  } = req.body || {};

  if (!full_name || !email || !phone || !company || !market || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const headers = {
    'Authorization': 'Bearer ' + apiKey,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  try {
    // 1. Find the "Hero HomeReach Partner Reviews" group, creating it
    //    on first use so Trent doesn't have to pre-create it manually.
    var groupId;
    var lookupRes = await fetch(
      'https://connect.mailerlite.com/api/groups?filter[name]=' + encodeURIComponent(GROUP_NAME),
      { headers: headers }
    );
    var lookupData = await lookupRes.json();
    var existingGroup = (lookupData.data || []).find(function (g) { return g.name === GROUP_NAME; });

    if (existingGroup) {
      groupId = existingGroup.id;
    } else {
      var createGroupRes = await fetch('https://connect.mailerlite.com/api/groups', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ name: GROUP_NAME })
      });
      if (!createGroupRes.ok) {
        throw new Error('Could not create MailerLite group: ' + (await createGroupRes.text()));
      }
      var createGroupData = await createGroupRes.json();
      groupId = createGroupData.data.id;
    }

    // 2. Upsert the subscriber with the review details as custom
    //    fields, and add them to that group.
    //
    //    IMPORTANT: MailerLite requires custom fields to already exist
    //    in the account before a value can be set on them via API.
    //    Create these once in MailerLite (Settings -> Fields -> New
    //    field -> Text), spelled exactly like this, before testing:
    //      company, market, role, audiences, familiarity, interest_note
    //    "name" and "phone" are default MailerLite fields and don't
    //    need to be created.
    var subRes = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        email: email,
        fields: {
          name: full_name,
          phone: phone,
          company: company,
          market: market,
          role: role,
          audiences: Array.isArray(audiences) ? audiences.join(', ') : (audiences || ''),
          familiarity: assistance_familiarity || '',
          interest_note: partnership_interest || ''
        },
        groups: [groupId]
      })
    });

    if (!subRes.ok) {
      throw new Error('MailerLite subscriber error: ' + (await subRes.text()));
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Partner review submission failed:', err);
    return res.status(500).json({ error: 'Submission failed' });
  }
}
