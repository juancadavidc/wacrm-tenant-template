'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { MarcaApi } from '@contracts/marca/api';
import type { Marca } from '@contracts/marca/marca';
import { aplicarMarcaEnDocumento, fusionarMarca } from './aplicar-marca';

// La marca se lee en el servidor (config/ de la empresa) y baja por contexto
// a los componentes cliente: sidebar y pantallas de auth. La pantalla de
// Marca la actualiza en vivo con `useActualizarMarca`.
const MarcaContext = createContext<Marca | null>(null);
const ActualizarContext = createContext<((api: MarcaApi) => void) | null>(null);

export function MarcaProvider({
  marca,
  children,
}: {
  marca: Marca;
  children: React.ReactNode;
}) {
  const [actual, setActual] = useState(marca);

  useEffect(() => {
    setActual(marca);
  }, [marca]);

  const actualizar = useCallback((api: MarcaApi) => {
    setActual((m) => fusionarMarca(m, api));
    aplicarMarcaEnDocumento(document, api.marca);
  }, []);

  return (
    <MarcaContext.Provider value={actual}>
      <ActualizarContext.Provider value={actualizar}>
        {children}
      </ActualizarContext.Provider>
    </MarcaContext.Provider>
  );
}

export function useMarca(): Marca {
  const marca = useContext(MarcaContext);
  if (!marca) throw new Error('useMarca fuera de <MarcaProvider>');
  return marca;
}

export function useActualizarMarca(): (api: MarcaApi) => void {
  const actualizar = useContext(ActualizarContext);
  if (!actualizar) {
    throw new Error('useActualizarMarca fuera de <MarcaProvider>');
  }
  return actualizar;
}
