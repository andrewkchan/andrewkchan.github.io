const fs = require('fs');
const path = require('path');

const postsDir = path.join(__dirname, 'posts');
const outputDir = path.join(__dirname, '..');

const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.html') && f !== 'index.html');
const posts = files.map(file => {
  const content = fs.readFileSync(path.join(postsDir, file), 'utf8');
  const titleMatch = content.match(/<toyb-title>([\s\S]*?)<\/toyb-title>/);
  const dateMatch = content.match(/<toyb-date>([\s\S]*?)<\/toyb-date>/);
  const title = (titleMatch ? titleMatch[1].trim() : file.replace('.html', ''));
  const dateStr = dateMatch ? dateMatch[1].trim() : new Date().toISOString().split('T')[0];
  const pubDate = new Date(dateStr).toUTCString();
  return {
    title: title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    link: `https://andrewkchan.github.io/posts/${file}`,
    pubDate
  };
}).sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Andrew Chan</title>
    <link>https://andrewkchan.github.io</link>
    <description>Andrew Chan's blog</description>
    <language>en-us</language>
    ${posts.map(p => `    <item>
      <title>${p.title}</title>
      <link>${p.link}</link>
      <guid isPermaLink="true">${p.link}</guid>
      <pubDate>${p.pubDate}</pubDate>
    </item>`).join('\n')}
  </channel>
</rss>
`;
fs.writeFileSync(path.join(outputDir, 'feed.xml'), xml);
