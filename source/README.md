This directory is the source for the blog. It contains:
- A template for posts in `post.html`
- A template for the index page in `index.html`
- A `posts` directory containing post HTML files and any JS scripts or media that they need
- A `posts-source` directory which I use to write my posts in my preferred dev setup before transforming them to HTML + JS + raw media for the `posts` directory.

The posts and template follow the format used by my custom static site generator [toy-blog](https://github.com/andrewkchan/toy-blog).

The website consists of everything outside of the `source` directory, which gets ignored by github pages.
To develop the website:
1. `cd source && npm install`
2. `npm run build` to build the website.
3. `cd .. && python -m http.server` then go to `http://localhost:8000` in a web browser.