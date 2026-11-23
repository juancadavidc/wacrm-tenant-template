import { crearStubFetchMarca } from '@contracts/marca/api.stub';
import { suiteCdcPantalla } from './suite-cdc-pantalla';

suiteCdcPantalla(
  'stub',
  ({ rol, sinConfig, esCuadrado }) =>
    crearStubFetchMarca({
      rol,
      estado: sinConfig ? { config: {} } : undefined,
      esCuadrado: () => esCuadrado ?? true,
    }).fetch
);
