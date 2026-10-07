import { Banknote, Bell, Calculator, Landmark, LayoutDashboard, Package, Receipt, Settings, ShieldCheck, Tags, TrendingUp, Users, Wallet } from 'lucide-react';

const TODOS = ['ADMIN', 'VENTAS', 'PRODUCCION'];

// La barra lateral se arma con esta lista: cada persona ve solo lo que su rol permite.
export const MENU = [
  {
    grupo: 'Resumen',
    items: [{ ruta: '/dashboard', etiqueta: 'Dashboard', icono: LayoutDashboard, roles: ['ADMIN'] }],
  },
  {
    grupo: 'Caja y ventas',
    items: [
      { ruta: '/caja', etiqueta: 'Caja', icono: Banknote, roles: ['ADMIN', 'VENTAS'] },
      { ruta: '/ventas', etiqueta: 'Ventas y facturas', icono: Receipt, roles: ['ADMIN', 'VENTAS'] },
      { ruta: '/arqueo', etiqueta: 'Arqueo de caja', icono: Calculator, roles: ['ADMIN', 'VENTAS'] },
      { ruta: '/clientes', etiqueta: 'Clientes', icono: Users, roles: ['ADMIN', 'VENTAS'] },
    ],
  },
  {
    grupo: 'Inventario',
    items: [
      { ruta: '/inventario', etiqueta: 'Inventario', icono: Package, roles: TODOS },
      { ruta: '/productos', etiqueta: 'Productos y precios', icono: Tags, roles: ['ADMIN'] },
      { ruta: '/proyeccion', etiqueta: 'Proyección de demanda', icono: TrendingUp, roles: ['ADMIN', 'PRODUCCION'] },
    ],
  },
  {
    grupo: 'Finanzas',
    items: [
      { ruta: '/impuestos', etiqueta: 'Impuestos DGI', icono: Landmark, roles: ['ADMIN'] },
      { ruta: '/gastos', etiqueta: 'Gastos', icono: Wallet, roles: ['ADMIN'] },
    ],
  },
  {
    grupo: 'Sistema',
    items: [
      { ruta: '/notificaciones', etiqueta: 'Notificaciones', icono: Bell, roles: TODOS, contador: true },
      { ruta: '/usuarios', etiqueta: 'Usuarios y permisos', icono: ShieldCheck, roles: ['ADMIN'] },
      { ruta: '/configuracion', etiqueta: 'Configuración', icono: Settings, roles: ['ADMIN'] },
    ],
  },
];

export const INICIO_POR_ROL = { ADMIN: '/dashboard', VENTAS: '/caja', PRODUCCION: '/inventario' };

export function menuPara(rol) {
  return MENU.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(rol)) })).filter((g) => g.items.length > 0);
}

export function puedeEntrar(rol, ruta) {
  return MENU.some((g) => g.items.some((i) => i.ruta === ruta && i.roles.includes(rol)));
}
