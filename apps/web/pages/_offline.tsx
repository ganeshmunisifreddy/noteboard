import Head from 'next/head';
import NotFound from '../components/NotFound';

const OfflinePage = () => {
  return (
    <>
      <Head>
        <title>Offline | Notes</title>
      </Head>
      <NotFound text="You're offline. Reconnect to load this page." />
    </>
  );
};

export default OfflinePage;
