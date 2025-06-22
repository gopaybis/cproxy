export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (request.method === "POST" && pathname === "/upload") {
      try {
        const { proxies } = await request.json();
        if (!Array.isArray(proxies)) throw new Error("Invalid format");

        const content = proxies.join("\n");
        const result = await uploadToGitHub(content, env);
        return new Response(JSON.stringify({ success: true, result }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: true, message: err.message }), {
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (request.method === "POST" && pathname === "/") {
      try {
        const { ip, port } = await request.json();
        const url = `https://apihealtcheck.vercel.app/api/v1?ip=${ip}&port=${port}`;
        const res = await fetch(url);
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" }
        });
      } catch {
        return new Response(JSON.stringify({ error: true }), {
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    return new Response(getHtmlPage(), {
      headers: { "Content-Type": "text/html" }
    });
  }
};

async function uploadToGitHub(content, env) {
  const base64Content = btoa(unescape(encodeURIComponent(content)));
  const [owner, repo] = env.GITHUB_REPO.split('/');
  const filePath = env.GITHUB_FILE_PATH;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

  // Get current SHA
  const getRes = await fetch(url, {
    headers: {
      Authorization: `token ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json"
    }
  });

  let sha = undefined;
  if (getRes.ok) {
    const data = await getRes.json();
    sha = data.sha;
  }

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json"
    },
    body: JSON.stringify({
      message: "Update active proxies",
      content: base64Content,
      branch: env.GITHUB_BRANCH || "main",
      ...(sha ? { sha } : {})
    })
  });

  return await res.json();
}

function getHtmlPage() {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Proxy Checker</title>
</head>
<body>
  <h2>Proxy Checker with GitHub Upload</h2>
  <textarea id="input" rows="6" cols="60" placeholder="IP:PORT\\n..."></textarea><br>
  <button onclick="startCheck()">Mulai Cek</button>
  <button onclick="uploadToGitHub()">Upload ke GitHub</button>
  <pre id="output"></pre>

  <script>
    async function startCheck() {
      const input = document.getElementById('input').value.trim().split('\\n');
      const output = document.getElementById('output');
      output.textContent = '';
      window.activeProxies = [];

      for (const line of input) {
        const [ip, port] = line.split(':');
        const res = await fetch('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip, port })
        });

        const data = await res.json();
        const status = data.proxyip ? "✅ Active" : "❌ Inactive";
        output.textContent += \`\${ip}:\${port} - \${status}\\n\`;

        if (data.proxyip) {
          window.activeProxies.push(\`\${ip}:\${port}\`);
        }
      }
    }

    async function uploadToGitHub() {
      const res = await fetch('/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxies: window.activeProxies })
      });
      const result = await res.json();
      alert(result.success ? "✅ Uploaded!" : "❌ Failed: " + result.message);
    }
  </script>
</body>
</html>`;
}
