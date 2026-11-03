# Café Apante · Sistema de Caja e Inventario

Aplicación web de despliegue local para la MYPYME **Café Apante**: caja (efectivo y depósito bancario),
inventario en libras, clientes, impuestos DGI, dashboard con proyecciones y panel de notificaciones,
con acceso por roles. Corre en la laptop del negocio y el Dueño puede verla desde su celular por Wi-Fi.

## Cómo abrir el sistema

1. Haga doble clic en **`iniciar.bat`**. La primera vez instala los componentes y prepara las pantallas.
2. Se abre el navegador en `http://localhost:3000`. Deje abierta la ventana negra mientras usa el sistema.
3. Entre con uno de los tres usuarios iniciales. Sus contraseñas temporales se generan al azar en cada
   instalación y quedan en el archivo **`contrasenas-iniciales.txt`** de esta carpeta. El sistema obliga a
   cambiarlas en el primer ingreso; cuando los tres ya hayan entrado, **borre ese archivo**.

| Usuario | Rol | Qué puede hacer |
|---|---|---|
| `admin` | Dueño / Administrador | Todo: dashboard, impuestos, gastos, usuarios, configuración, respaldos, anular ventas |
| `ventas` | Gerente de Ventas | Caja, ventas y facturas, arqueo de caja, clientes, consultar existencias |
| `produccion` | Responsable de Producción | Entradas de café, mermas, ajustes de inventario, proyección de demanda |

Requisitos de la laptop: Windows, **SQL Server Express**, **Node.js LTS** y el controlador
*ODBC Driver 18 for SQL Server* (sirve también el 17). El sistema encuentra solo la instancia de SQL Server
instalada y la base de datos `CafeApante` se crea sola al primer arranque.

## Para el equipo: clonar el repositorio y ver el sistema

Cada compañero puede tener el sistema completo en su computadora, con su propia base de datos.

1. **Instale una sola vez** (todo es gratuito):
   - [Git](https://git-scm.com/download/win) y [Node.js LTS](https://nodejs.org) (versión 22 o más nueva).
   - [SQL Server Express](https://www.microsoft.com/es-es/sql-server/sql-server-downloads): la instalación
     *Básica* basta. Cualquier nombre de instancia sirve (`SQLEXPRESS`, `SQLEXPRESS01` o la predeterminada).
   - [ODBC Driver 18 for SQL Server](https://learn.microsoft.com/es-es/sql/connect/odbc/download-odbc-driver-for-sql-server)
     (a veces ya viene con SQL Server).
   - Para ver las tablas: [SQL Server Management Studio (SSMS)](https://learn.microsoft.com/es-es/ssms/install/install).
2. **Descargue el proyecto e instale sus componentes** (en una terminal):
   ```bat
   git clone https://github.com/LudwingJassir/cafe-apante.git
   cd cafe-apante\cafe-apante
   npm install
   ```
3. **Vea el sistema con datos de prueba** (unos 4 meses de ventas, clientes, cierres de caja y gastos):
   ```bat
   npm run db:demo
   npm run demo
   ```
   Se abre en `http://localhost:3210`. Los usuarios y contraseñas de la demostración quedan en el archivo
   `contrasenas-iniciales-CafeApante_Demo.txt` de esa carpeta.
4. **O ábralo vacío**, como lo recibe el negocio: doble clic en `iniciar.bat` (`http://localhost:3000`, contraseñas
   en `contrasenas-iniciales.txt`).
5. **Para ver la base de datos**, abra SSMS y conéctese con *Autenticación de Windows* al servidor
   `.\SQLEXPRESS` (o el nombre de su instancia). Ahí están `CafeApante_Demo` (la demostración) y `CafeApante`.
   Las tablas siguen el diagrama de clases y se definen en `server/db/esquema.sql`.

**Qué no está en GitHub, a propósito.** El repositorio es público: no lleva la base de datos del negocio, ni
respaldos `.bak`, ni contraseñas, ni el archivo `server/.secreto`. Cada computadora crea los suyos al arrancar.
Si necesitan los mismos datos reales, pase un respaldo `.bak` en persona (memoria USB) y restáurelo con SSMS;
nunca lo suba al repositorio.

**Para traer los cambios nuevos**: `git pull`, luego `npm install` y `npm run build` (o borre la carpeta `dist`
para que `iniciar.bat` la vuelva a preparar).

**Si algo falla:**

| Mensaje | Qué hacer |
|---|---|
| `No se pudo conectar a SQL Server` | El mensaje muestra las instancias instaladas. Revise que el servicio *SQL Server* esté iniciado (Windows → *Servicios*). Si debe usar otra instancia, copie `.env.example` como `.env` y escriba su nombre en `SQL_SERVIDOR`. |
| `Data source name not found` o algo sobre el *driver* | Instale *ODBC Driver 18 for SQL Server*. |
| `npm` no se reconoce | Instale Node.js LTS y abra una terminal nueva. |
| `El puerto 3000 ya está en uso` | El sistema ya está abierto en otra ventana: ciérrela. |

## Primeros pasos (el sistema arranca vacío)

1. **Configuración** → datos del negocio, cuenta bancaria para depósitos y tipo de cambio.
2. **Productos y precios** → cree cada café con sus bolsas (400 g y 1 lb) y precios normal y mayorista.
3. **Inventario** → Producción registra las entradas de café en libras.
4. **Caja** → abra la caja con el fondo inicial y empiece a vender.

## Módulos y requisitos

| Requisito | Dónde está |
|---|---|
| RF01 Administrar usuarios y permisos | *Usuarios y permisos*: altas, roles, activar/desactivar, contraseñas temporales, bitácora |
| RF02 Entrada de café y ajuste de mermas | *Inventario*: entrada por lote, merma con motivo, ajuste por conteo físico, historial |
| RF03 Alerta de stock bajo | Semáforo (verde / amarillo / rojo) y panel de *Notificaciones* (stock medio, bajo y agotado) |
| RF04 Registrar venta | *Caja*: efectivo en córdobas o dólares (vuelto en córdobas) y depósito bancario (se muestran la cuenta y el monto); el depósito exige anotar su número de referencia |
| Arqueo y cierre de caja | *Arqueo de caja*: conteo billete por billete (córdobas: billetes de C$ 10 a C$ 1,000 y monedas de 10 centavos a C$ 10; dólares: billetes de US$ 1 a US$ 100) o escribiendo el total; el desglose queda guardado en cada cierre |
| RF05 Factura y parámetros tributarios | Comprobante imprimible con IVA desglosado; tasas editables en *Configuración → Impuestos* |
| RF06 Registrar cliente | *Clientes*: Grandes (precio mayorista) y Pequeños, con historial y hábitos de compra |
| RF07 Dashboard interactivo | *Dashboard*: ventas por día y por mes, más vendidos, clientes, formas de pago, inventario |
| RF08 Proyección de demanda | *Proyección de demanda*: media móvil ponderada y libras sugeridas a procesar |
| Respaldos | *Configuración → Respaldos*: copia diaria automática y manual, con copia a USB |
| Acceso desde el celular | *Configuración → Celular*: dirección y código QR para la red local |

## Cómo se calculan los impuestos (Régimen General)

Las tasas vienen cargadas según la Ley 822 de Concertación Tributaria y sus reformas, y se pueden editar.

- **IVA (15 %)**: se desglosa en cada venta. Por defecto los precios ya lo incluyen.
- **Retención de IR (2 %)**: se descuenta a clientes marcados como retenedores cuando la venta sin IVA llega a C$ 1,000.
- **Cada mes**: IVA por pagar = IVA cobrado − IVA acreditable de los gastos. Anticipo de IR = 1 % de los
  ingresos brutos − retenciones que le hicieron. Los saldos a favor pasan al mes siguiente.
- **IR anual**: el mayor entre (a) la tasa del estrato aplicada a la renta neta (ingresos − gastos registrados)
  y (b) el pago mínimo definitivo del 1 % de los ingresos brutos; menos anticipos y retenciones.
  La pantalla *Impuestos DGI* muestra lo acumulado y una proyección al 31 de diciembre.

> Son estimaciones para planificar. Confirme las cifras con su contador antes de declarar. El comprobante
> que imprime el sistema es un documento interno: para que valga como factura fiscal, la numeración debe
> estar autorizada por la DGI.

## Proyecciones

- **Demanda (libras)**: media móvil ponderada de las últimas 4 semanas completas (40 %, 30 %, 20 %, 10 %).
  Sugerido a procesar = demanda del periodo + punto de reorden − stock actual.
- **Ingresos**: la misma media móvil sobre las ventas semanales, repartida según lo que suele venderse cada
  día de la semana, para estimar el cierre del mes. El próximo mes usa los últimos 3 meses completos (3, 2, 1).

## Respaldos y restauración

Los respaldos (`.bak`) se guardan en `C:\Users\Public\Documents\CafeApante\Respaldos` y, si se configura,
se copian a una memoria USB o carpeta sincronizada. Para restaurar uno, cierre el sistema y use SQL Server
Management Studio (*Bases de datos → Restaurar base de datos*) eligiendo el archivo `.bak`.

## Ver el sistema desde el celular

Con el celular en la misma red Wi-Fi, abra la dirección que aparece en *Configuración → Celular*
(por ejemplo `http://192.168.1.20:3000`). La primera vez, Windows pregunta si permite las conexiones de
Node.js: acepte para **redes privadas**. Si no aparece la pregunta, un administrador de la laptop puede
abrir el puerto con:

```bat
netsh advfirewall firewall add rule name="Cafe Apante" dir=in action=allow protocol=TCP localport=3000 profile=private
```

## Demostración con datos ficticios

Para presentar el sistema sin tocar la información real hay una base aparte, `CafeApante_Demo`:

```bat
npm run db:demo
npm run demo
```

El primer comando carga unos 4 meses de ventas ficticias; el segundo abre la demostración en
`http://localhost:3210`. Las contraseñas de la demostración quedan en
`contrasenas-iniciales-CafeApante_Demo.txt` y ahí no se pide cambiarlas.

## Para desarrollo

| Comando | Para qué |
|---|---|
| `npm run dev` | Servidor con recarga automática + interfaz en `http://localhost:5173` |
| `npm run build` | Compila la interfaz a `dist/` |
| `npm start` | Abre el sistema (lo mismo que `iniciar.bat`, sin abrir el navegador) |
| `npm test` | Pruebas de reglas de negocio y de flujo completo (usa la base `CafeApante_Pruebas`) |
| `npm run db:init` | Crea la base y las tablas si faltan |

Estructura:

```
shared/calculos.js   Reglas de negocio puras: IVA, retención, vuelto, semáforo, proyección, IR anual
server/              API en Express 5 sobre SQL Server (autenticación de Windows vía ODBC)
  db/esquema.sql     Tablas, siguiendo el diagrama de clases del proyecto
  rutas/             Un archivo por módulo; el control por rol está en app.js
  servicios/         Inventario, impuestos, proyección, notificaciones, respaldos y tareas automáticas
client/src/          Interfaz en React + Tailwind CSS
  paginas/           Una pantalla por opción de la barra lateral
```

Decisiones respecto al documento de planificación:

- **Presentaciones**: el stock se lleva en libras por producto (como pide el documento) y cada producto tiene
  sus bolsas de venta con precio propio, en lugar de un único `precioPorLibra`.
- **Gastos**: se agregó un registro simple de gastos, necesario para estimar la renta neta del IR anual.
- **Notificaciones, sesiones de caja, respaldos y bitácora** son tablas adicionales al diagrama de clases.
- **Bloqueo de acceso**: tras 5 contraseñas incorrectas seguidas (configurable de 3 a 10), la pantalla de acceso muestra
  «no se puede ingresar la contraseña durante X minutos» con una cuenta regresiva (de 1 a 60 minutos, 5 por omisión),
  y el sistema avisa al Dueño. Se ajusta en *Configuración → Negocio → Seguridad del acceso*.
- **Seguridad**: contraseñas con bcrypt; sesión en cookie `httpOnly` que se borra al cerrar el navegador,
  vence a las 10 horas y se cierra sola tras 30 minutos sin uso; cambiar la contraseña cierra las demás
  sesiones; bloqueo de 5 minutos por dispositivo tras 5 intentos fallidos; consultas parametrizadas y permisos
  verificados en el servidor en cada petición.

## Recomendaciones de seguridad

- Use el sistema solo en el Wi-Fi del negocio, con contraseña WPA2/WPA3. Viaja por HTTP dentro de la red
  local: no lo conecte a redes públicas ni abra el puerto hacia internet.
- No comparta los archivos `server/.secreto` ni `contrasenas-iniciales*.txt`. Si copia la carpeta a otra
  computadora, borre `server/.secreto`: el sistema crea uno nuevo.
- Los respaldos (`.bak`) contienen toda la información del negocio. Guarde la memoria USB en un lugar seguro.
- Coteje los depósitos con el estado de cuenta del banco: el sistema guarda la referencia, pero no puede
  comprobar que el dinero llegó.
