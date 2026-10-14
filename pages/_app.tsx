import '../styles/tokens.css'
import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { Lato } from 'next/font/google'
import { useSystemThemeSync } from '../lib/theme'

const lato = Lato({
  weight: ['300', '400', '700'],
  subsets: ['latin'],
  display: 'swap',
})

function MyApp({ Component, pageProps }: AppProps) {
  useSystemThemeSync()
  return (
    <>
      <style jsx global>{`
        html,
        body {
          font-family: ${lato.style.fontFamily};
        }
      `}</style>
      <Component {...pageProps} />
    </>
  )
}

export default MyApp
