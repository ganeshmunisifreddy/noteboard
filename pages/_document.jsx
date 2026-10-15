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
          {/* Runs before first paint: apply the saved theme, and hide the
              server-rendered empty state when notes exist so it doesn't
              flash while they load. Keep in sync with lib/theme.ts. */}
          <script
            dangerouslySetInnerHTML={{
              __html: `try{var s=localStorage,d=document.documentElement,t=s.getItem("theme");d.dataset.theme=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light";var l=JSON.parse(s.getItem("notes")||"[]");if(s.getItem("hasNotes")||(Array.isArray(l)&&l.length))d.setAttribute("data-has-notes","");if(s.getItem("sidebar")==="rail")d.setAttribute("data-sidebar","rail")}catch(e){}`,
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
