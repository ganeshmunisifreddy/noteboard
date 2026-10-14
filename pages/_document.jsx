import Document, { Html, Head, Main, NextScript } from "next/document";

class MyDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head>
          <link rel="manifest" href="/manifest.json" />
          <link rel="shortcut icon" href="/icon.png" />
          <link rel="apple-touch-icon" href="/icon.png" />
          <meta name="theme-color" content="#fff" />
          {/* Runs before first paint: hide the server-rendered empty state
              when saved notes exist, so it doesn't flash before hydration. */}
          <script
            dangerouslySetInnerHTML={{
              __html: `try{var n=JSON.parse(localStorage.getItem("notes"));if(Array.isArray(n)&&n.length)document.documentElement.setAttribute("data-has-notes","")}catch(e){}`,
            }}
          />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
