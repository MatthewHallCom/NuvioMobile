import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

interface NetworkContextValue {
  isConnected: boolean;
  isWiFi: boolean;
  connectionType: string;
}

const NetworkContext = createContext<NetworkContextValue>({
  isConnected: true,
  isWiFi: true,
  connectionType: 'unknown',
});

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(true);
  const [isWiFi, setIsWiFi] = useState(true);
  const [connectionType, setConnectionType] = useState('unknown');

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setIsConnected(state.isConnected ?? true);
      setIsWiFi(state.type === 'wifi');
      setConnectionType(state.type);
    });

    // Fetch initial state
    NetInfo.fetch().then((state: NetInfoState) => {
      setIsConnected(state.isConnected ?? true);
      setIsWiFi(state.type === 'wifi');
      setConnectionType(state.type);
    });

    return () => unsubscribe();
  }, []);

  const value = useMemo(
    () => ({ isConnected, isWiFi, connectionType }),
    [isConnected, isWiFi, connectionType]
  );

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextValue {
  return useContext(NetworkContext);
}
