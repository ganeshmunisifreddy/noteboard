import '../styles/tokens.css'
import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { Lato } from 'next/font/google'
import { MotionConfig } from 'framer-motion'
import ReminderAlerts from '../components/ui/ReminderAlerts'
import StorageBanner from '../components/ui/StorageBanner'
import { ToastProvider } from '../components/ui/Toast'
import { useGlobalShortcuts } from '../lib/shortcuts'
import { useSystemThemeSync } from '../lib/theme'

const lato = Lato({
  weight: ['300', '400', '700'],
  subsets: ['latin'],
  display: 'swap',
})

function MyApp({ Component, pageProps }: AppProps) {
  useGlobalShortcuts()
  useSystemThemeSync()
  return (
    <>
      <style jsx global>{`
        html,
        body {
          font-family: ${lato.style.fontFamily};
        }
      `}</style>
      <MotionConfig reducedMotion='user'>
        <ToastProvider>
          <StorageBanner />
          {/* Before the page: it sits at the top, so it comes first in tab order. */}
          <ReminderAlerts />
          <Component {...pageProps} />
        </ToastProvider>
      </MotionConfig>
    </>
  )
}

export default MyApp
