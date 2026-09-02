// Netlify serverless function \u2014 proxies to Pl@ntNet server-to-server, which sidesteps
// their CORS block on direct browser calls from arbitrary origins.
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = (process.env.PLANTNET_API_KEY || '').trim();
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server not configured: PLANTNET_API_KEY is missing. Add it in Netlify > Site configuration > Environment variables.' })
    };
  }

  let image, organ;
  try {
    const parsed = JSON.parse(event.body || '{}');
    image = parsed.image;
    organ = parsed.organ || 'flower';
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }
  if (!image) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing image data' }) };
  }

  try {
    const buffer = Buffer.from(image, 'base64');
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('images', blob, 'photo.jpg');
    formData.append('organs', organ);

    const project = 'weurope';
    const url = `https://my-api.plantnet.org/v2/identify/${project}?api-key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, { method: 'POST', body: formData });

    if (!response.ok) {
      const errText = await response.text();
      return { statusCode: response.status, body: JSON.stringify({ error: `Pl@ntNet API error: ${errText}` }) };
    }

    const data = await response.json();
    const suggestions = (data.results || []).slice(0, 3).map(r => ({
      latin: r.species && r.species.scientificNameWithoutAuthor,
      common: (r.species && r.species.commonNames && r.species.commonNames[0]) || '',
      confidence: r.score >= 0.5 ? 'high' : r.score >= 0.2 ? 'medium' : 'low'
    })).filter(s => s.latin);

    const result = {
      suggestions,
      uncertain_note: suggestions.length === 0 ? "Pl@ntNet couldn't confidently identify this photo." : ''
    };

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: `Pl@ntNet request setup failed: ${String(e && e.message || e)}` }) };
  }
};
