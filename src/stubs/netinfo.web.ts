// @react-native-community/netinfo web stub. Used in 1 file (NetworkContext.tsx).
type NetInfoState = {
  type: string;
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  details: any;
};

const getState = (): NetInfoState => ({
  type: 'wifi',
  isConnected: navigator.onLine,
  isInternetReachable: navigator.onLine,
  details: null,
});

const NetInfo = {
  fetch: () => Promise.resolve(getState()),
  addEventListener: (callback: (state: NetInfoState) => void) => {
    const handler = () => callback(getState());
    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);
    // Fire initial state
    callback(getState());
    return () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
    };
  },
  useNetInfo: () => getState(),
  refresh: () => Promise.resolve(getState()),
};

export default NetInfo;
export const useNetInfo = () => getState();
export const fetch = NetInfo.fetch;
export const addEventListener = NetInfo.addEventListener;
export const refresh = NetInfo.refresh;
