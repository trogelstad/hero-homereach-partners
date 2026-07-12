// Hero HomeReach Partners — Partner Review form handler
// Vercel serverless function. Receives the modal form POST from
// /lenders/index.html, upserts the contact into MailerLite and adds
// them to the "Hero HomeReach Partner Reviews" group.
//
// Requires one environment variable, set in Vercel's dashboard
// (Project -> Settings -> Environment Variables), NOT in this file:
//   MAILERLITE_API_KEY = <your real MailerLite API key>
//
// NOTE (2026-07-08, fix): rewritten from ESM `export default` to
// CommonJS `module.exports` — this repo has no package.json setting
// "type": "module", so Vercel's Node runtime treated the previous
// version's `export default` as invalid syntax and the function
// crashed on every call, which is why the first live test failed
// with a generic "something went wrong" error. CommonJS works with
// zero additional config, which matches everything else in this repo.
//
// Email notification to Trent is intentionally NOT sent from here —
// it's handled by a MailerLite Automation (trigger: "subscriber joins
// group Hero HomeReach Partner Reviews" -> action: send Trent an
// email), which is already set up. This function's only job is
// getting the contact into MailerLite correctly.

const GROUP_NAME = 'Hero HomeReach Partner Reviews';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.MAILERLITE_API_KEY;
  if (!apiKey) {
    console.error('MAILERLITE_API_KEY is not set in Vercel environment variables.');
    return res.status(500).json({ error: 'Server not configured' });
  }

  const body = req.body || {};
  const {
    full_name, email, phone, company, role,
    audiences, assistance_familiarity, partnership_interest
  } = body;

  if (!full_name || !email || !phone || !company || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const headers = {
    'Authorization': 'Bearer ' + apiKey,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  try {
    // 1. Find the "Hero HomeReach Partner Reviews" group (it may
    //    already exist — Trent created it manually while setting up
    //    the notification automation). Create it only if it's
    //    genuinely missing.
    var groupId;
    var lookupRes = await fetch(
      'https://connect.mailerlite.com/api/groups?filter[name]=' + encodeURIComponent(GROUP_NAME),
      { headers: headers }
    );
    if (!lookupRes.ok) {
      throw new Error('Group lookup failed: ' + lookupRes.status + ' ' + (await lookupRes.text()));
    }
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
        throw new Error('Could not create MailerLite group: ' + createGroupRes.status + ' ' + (await createGroupRes.text()));
      }
      var createGroupData = await createGroupRes.json();
      groupId = createGroupData.data.id;
    }

    // 2. Upsert the subscriber with the review details as custom
    //    fields (company/market/role/audiences/familiarity/interest_note
    //    all confirmed to exist in MailerLite with matching tags),
    //    and add them to that group.
    var subRes = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        email: email,
        fields: {
          name: full_name,
          phone: phone,
          company: company,
          role: role,
          audiences: Array.isArray(audiences) ? audiences.join(', ') : (audiences || ''),
          familiarity: assistance_familiarity || '',
          interest_note: partnership_interest || ''
        },
        groups: [groupId]
      })
    });

    if (!subRes.ok) {
      throw new Error('MailerLite subscriber error: ' + subRes.status + ' ' + (await subRes.text()));
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Partner review submission failed:', err);
    return res.status(500).json({ error: 'Submission failed', detail: String(err && err.message || err) });
  }
};
