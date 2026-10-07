-- Esquema de Café Apante. Se puede ejecutar varias veces: solo crea lo que falta.
-- Las tablas siguen el diagrama de clases del proyecto (Usuario, Producto, Venta, ...).

IF OBJECT_ID('dbo.Usuario') IS NULL
CREATE TABLE dbo.Usuario (
  idUsuario             INT IDENTITY(1,1) PRIMARY KEY,
  nombre                NVARCHAR(100) NOT NULL,
  usuario               NVARCHAR(40)  NOT NULL CONSTRAINT UQ_Usuario_usuario UNIQUE,
  correo                NVARCHAR(120) NULL,
  contrasena            NVARCHAR(100) NOT NULL, -- hash bcrypt, nunca texto plano
  rol                   VARCHAR(12)   NOT NULL CONSTRAINT CK_Usuario_rol CHECK (rol IN ('ADMIN','VENTAS','PRODUCCION')),
  estado                VARCHAR(10)   NOT NULL CONSTRAINT DF_Usuario_estado DEFAULT 'ACTIVO'
                                      CONSTRAINT CK_Usuario_estado CHECK (estado IN ('ACTIVO','INACTIVO')),
  debeCambiarContrasena BIT           NOT NULL CONSTRAINT DF_Usuario_cambio DEFAULT 1,
  versionSesion         INT           NOT NULL CONSTRAINT DF_Usuario_version DEFAULT 0, -- sube al cambiar la contraseña: invalida sesiones viejas
  ultimoAcceso          DATETIME2(0)  NULL,
  creadoEn              DATETIME2(0)  NOT NULL CONSTRAINT DF_Usuario_creado DEFAULT SYSDATETIME()
);
GO

IF OBJECT_ID('dbo.ConfiguracionTributaria') IS NULL
CREATE TABLE dbo.ConfiguracionTributaria (
  idConfig             INT           NOT NULL PRIMARY KEY CONSTRAINT CK_ConfigTrib_unica CHECK (idConfig = 1),
  tasaIVA              DECIMAL(5,2)  NOT NULL,
  tasaRetencionDGI     DECIMAL(5,2)  NOT NULL,
  montoMinimoRetencion DECIMAL(12,2) NOT NULL,
  tasaAnticipoIR       DECIMAL(5,2)  NOT NULL,
  tasaIRGeneral        DECIMAL(5,2)  NOT NULL,
  topeTablaProgresiva  DECIMAL(14,2) NOT NULL,
  tablaIR              NVARCHAR(MAX) NOT NULL, -- JSON: [{ "hasta": 100000, "tasa": 10 }, ...]
  preciosIncluyenIVA   BIT           NOT NULL,
  fechaActualizacion   DATETIME2(0)  NOT NULL CONSTRAINT DF_ConfigTrib_fecha DEFAULT SYSDATETIME(),
  actualizadoPor       NVARCHAR(100) NULL
);
GO

IF OBJECT_ID('dbo.ConfiguracionNegocio') IS NULL
CREATE TABLE dbo.ConfiguracionNegocio (
  idConfig          INT           NOT NULL PRIMARY KEY CONSTRAINT CK_ConfigNeg_unica CHECK (idConfig = 1),
  nombre            NVARCHAR(100) NOT NULL,
  ruc               NVARCHAR(30)  NULL,
  direccion         NVARCHAR(200) NULL,
  telefono          NVARCHAR(30)  NULL,
  mensajeComprobante NVARCHAR(200) NULL,
  banco             NVARCHAR(60)  NULL,
  titularCuenta     NVARCHAR(100) NULL,
  cuentaNIO         NVARCHAR(40)  NULL,
  cuentaUSD         NVARCHAR(40)  NULL,
  tipoCambio        DECIMAL(10,4) NOT NULL,
  seriePrefijo      NVARCHAR(6)   NOT NULL,
  siguienteNumero   INT           NOT NULL,
  factorStockMedio  DECIMAL(4,2)  NOT NULL,
  respaldoAuto      BIT           NOT NULL,
  respaldoHora      CHAR(5)       NOT NULL,
  respaldoDestino   NVARCHAR(260) NULL,
  respaldoConservar INT           NOT NULL
);
GO

IF OBJECT_ID('dbo.Producto') IS NULL
CREATE TABLE dbo.Producto (
  idProducto     INT IDENTITY(1,1) PRIMARY KEY,
  nombre         NVARCHAR(100) NOT NULL,
  tipo           VARCHAR(10)   NOT NULL CONSTRAINT CK_Producto_tipo CHECK (tipo IN ('MOLIDO','GRANO')),
  descripcion    NVARCHAR(200) NULL,
  stockActual    DECIMAL(12,3) NOT NULL CONSTRAINT DF_Producto_stock DEFAULT 0, -- siempre en libras
  puntoReorden   DECIMAL(12,3) NOT NULL CONSTRAINT DF_Producto_reorden DEFAULT 0,
  estadoSemaforo VARCHAR(10)   NOT NULL CONSTRAINT DF_Producto_semaforo DEFAULT 'AGOTADO'
                               CONSTRAINT CK_Producto_semaforo CHECK (estadoSemaforo IN ('AGOTADO','BAJO','MEDIO','OK')),
  aplicaIVA      BIT           NOT NULL CONSTRAINT DF_Producto_iva DEFAULT 1,
  estado         VARCHAR(10)   NOT NULL CONSTRAINT DF_Producto_estado DEFAULT 'ACTIVO'
                               CONSTRAINT CK_Producto_estado CHECK (estado IN ('ACTIVO','INACTIVO')),
  creadoEn       DATETIME2(0)  NOT NULL CONSTRAINT DF_Producto_creado DEFAULT SYSDATETIME(),
  CONSTRAINT CK_Producto_stock CHECK (stockActual >= 0)
);
GO

-- Bolsas comerciales en que se vende cada producto (400 g, 1 lb, ...).
IF OBJECT_ID('dbo.Presentacion') IS NULL
CREATE TABLE dbo.Presentacion (
  idPresentacion  INT IDENTITY(1,1) PRIMARY KEY,
  idProducto      INT           NOT NULL CONSTRAINT FK_Presentacion_Producto REFERENCES dbo.Producto(idProducto),
  nombre          NVARCHAR(40)  NOT NULL,
  pesoLibras      DECIMAL(8,3)  NOT NULL CONSTRAINT CK_Presentacion_peso CHECK (pesoLibras > 0), -- milésimas, igual que el stock
  precio          DECIMAL(12,2) NOT NULL CONSTRAINT CK_Presentacion_precio CHECK (precio >= 0),
  precioMayorista DECIMAL(12,2) NOT NULL CONSTRAINT CK_Presentacion_mayorista CHECK (precioMayorista >= 0),
  estado          VARCHAR(10)   NOT NULL CONSTRAINT DF_Presentacion_estado DEFAULT 'ACTIVO'
);
GO

IF OBJECT_ID('dbo.Cliente') IS NULL
CREATE TABLE dbo.Cliente (
  idCliente      INT IDENTITY(1,1) PRIMARY KEY,
  nombre         NVARCHAR(120) NOT NULL,
  telefono       NVARCHAR(30)  NULL,
  direccion      NVARCHAR(200) NULL,
  identificacion NVARCHAR(30)  NULL, -- RUC o cédula
  categoria      VARCHAR(10)   NOT NULL CONSTRAINT CK_Cliente_categoria CHECK (categoria IN ('GRANDE','PEQUENO')),
  esRetenedor    BIT           NOT NULL CONSTRAINT DF_Cliente_retenedor DEFAULT 0,
  estado         VARCHAR(10)   NOT NULL CONSTRAINT DF_Cliente_estado DEFAULT 'ACTIVO',
  creadoEn       DATETIME2(0)  NOT NULL CONSTRAINT DF_Cliente_creado DEFAULT SYSDATETIME()
);
GO

IF OBJECT_ID('dbo.SesionCaja') IS NULL
BEGIN
  CREATE TABLE dbo.SesionCaja (
    idSesion          INT IDENTITY(1,1) PRIMARY KEY,
    idUsuarioApertura INT           NOT NULL CONSTRAINT FK_Sesion_UsuarioA REFERENCES dbo.Usuario(idUsuario),
    fechaApertura     DATETIME2(0)  NOT NULL CONSTRAINT DF_Sesion_apertura DEFAULT SYSDATETIME(),
    montoInicial      DECIMAL(12,2) NOT NULL,
    idUsuarioCierre   INT           NULL CONSTRAINT FK_Sesion_UsuarioC REFERENCES dbo.Usuario(idUsuario),
    fechaCierre       DATETIME2(0)  NULL,
    esperadoNIO       DECIMAL(12,2) NULL,
    esperadoUSD       DECIMAL(12,2) NULL,
    contadoNIO        DECIMAL(12,2) NULL,
    contadoUSD        DECIMAL(12,2) NULL,
    diferenciaNIO     DECIMAL(12,2) NULL,
    diferenciaUSD     DECIMAL(12,2) NULL,
    totalVentas       DECIMAL(12,2) NULL,
    totalDepositos    DECIMAL(12,2) NULL,
    observacion       NVARCHAR(300) NULL,
    estado            VARCHAR(10)   NOT NULL CONSTRAINT DF_Sesion_estado DEFAULT 'ABIERTA'
                                    CONSTRAINT CK_Sesion_estado CHECK (estado IN ('ABIERTA','CERRADA'))
  );
  -- La laptop tiene una sola gaveta: nunca puede haber dos cajas abiertas a la vez.
  CREATE UNIQUE INDEX UX_SesionCaja_Abierta ON dbo.SesionCaja(estado) WHERE estado = 'ABIERTA';
END
GO

IF OBJECT_ID('dbo.Venta') IS NULL
BEGIN
  CREATE TABLE dbo.Venta (
    idVenta            INT IDENTITY(1,1) PRIMARY KEY,
    fecha              DATETIME2(0)  NOT NULL CONSTRAINT DF_Venta_fecha DEFAULT SYSDATETIME(),
    idCliente          INT           NULL CONSTRAINT FK_Venta_Cliente REFERENCES dbo.Cliente(idCliente),
    idUsuario          INT           NOT NULL CONSTRAINT FK_Venta_Usuario REFERENCES dbo.Usuario(idUsuario),
    idSesionCaja       INT           NOT NULL CONSTRAINT FK_Venta_Sesion REFERENCES dbo.SesionCaja(idSesion),
    subtotal           DECIMAL(12,2) NOT NULL, -- sin IVA
    ivaCalculado       DECIMAL(12,2) NOT NULL,
    retencionDGI       DECIMAL(12,2) NOT NULL,
    total              DECIMAL(12,2) NOT NULL, -- subtotal + IVA
    totalCobrar        DECIMAL(12,2) NOT NULL, -- total - retención
    totalLibras        DECIMAL(12,3) NOT NULL,
    metodoPago         VARCHAR(10)   NOT NULL CONSTRAINT CK_Venta_metodo CHECK (metodoPago IN ('EFECTIVO','DEPOSITO')),
    monedaPago         CHAR(3)       NOT NULL CONSTRAINT CK_Venta_moneda CHECK (monedaPago IN ('NIO','USD')),
    montoRecibido      DECIMAL(12,2) NOT NULL,
    tipoCambio         DECIMAL(10,4) NOT NULL,
    vuelto             DECIMAL(12,2) NOT NULL,
    referenciaDeposito NVARCHAR(40)  NULL,
    estado             VARCHAR(10)   NOT NULL CONSTRAINT DF_Venta_estado DEFAULT 'COMPLETADA'
                                     CONSTRAINT CK_Venta_estado CHECK (estado IN ('COMPLETADA','ANULADA')),
    motivoAnulacion    NVARCHAR(200) NULL,
    idUsuarioAnula     INT           NULL CONSTRAINT FK_Venta_UsuarioAnula REFERENCES dbo.Usuario(idUsuario),
    fechaAnulacion     DATETIME2(0)  NULL,
    -- Caja de la que salió el dinero devuelto, cuando se anula una venta en efectivo de una caja ya cerrada.
    idSesionAnulacion  INT           NULL CONSTRAINT FK_Venta_SesionAnulacion REFERENCES dbo.SesionCaja(idSesion)
  );
  CREATE INDEX IX_Venta_fecha ON dbo.Venta(fecha) INCLUDE (estado, total, subtotal, ivaCalculado, retencionDGI, totalLibras);
  CREATE INDEX IX_Venta_cliente ON dbo.Venta(idCliente, fecha);
  CREATE INDEX IX_Venta_sesion ON dbo.Venta(idSesionCaja);
  -- Una misma referencia bancaria no puede respaldar dos ventas vigentes.
  CREATE UNIQUE INDEX UX_Venta_referencia ON dbo.Venta(referenciaDeposito) WHERE referenciaDeposito IS NOT NULL AND estado = 'COMPLETADA';
END
GO

IF OBJECT_ID('dbo.DetalleVenta') IS NULL
BEGIN
  CREATE TABLE dbo.DetalleVenta (
    idDetalle      INT IDENTITY(1,1) PRIMARY KEY,
    idVenta        INT           NOT NULL CONSTRAINT FK_Detalle_Venta REFERENCES dbo.Venta(idVenta),
    idProducto     INT           NOT NULL CONSTRAINT FK_Detalle_Producto REFERENCES dbo.Producto(idProducto),
    idPresentacion INT           NOT NULL CONSTRAINT FK_Detalle_Presentacion REFERENCES dbo.Presentacion(idPresentacion),
    descripcion    NVARCHAR(150) NOT NULL,
    cantidad       INT           NOT NULL CONSTRAINT CK_Detalle_cantidad CHECK (cantidad > 0),
    cantidadLibras DECIMAL(12,3) NOT NULL,
    precioUnitario DECIMAL(12,2) NOT NULL,
    subtotal       DECIMAL(12,2) NOT NULL, -- sin IVA
    iva            DECIMAL(12,2) NOT NULL,
    importe        DECIMAL(12,2) NOT NULL  -- lo que paga el cliente por la línea
  );
  CREATE INDEX IX_Detalle_venta ON dbo.DetalleVenta(idVenta);
  CREATE INDEX IX_Detalle_producto ON dbo.DetalleVenta(idProducto);
END
GO

IF OBJECT_ID('dbo.Factura') IS NULL
CREATE TABLE dbo.Factura (
  idFactura     INT IDENTITY(1,1) PRIMARY KEY,
  idVenta       INT           NOT NULL CONSTRAINT FK_Factura_Venta REFERENCES dbo.Venta(idVenta)
                              CONSTRAINT UQ_Factura_venta UNIQUE,
  numeroFactura NVARCHAR(20)  NOT NULL CONSTRAINT UQ_Factura_numero UNIQUE,
  fechaEmision  DATETIME2(0)  NOT NULL CONSTRAINT DF_Factura_fecha DEFAULT SYSDATETIME(),
  subtotal      DECIMAL(12,2) NOT NULL,
  iva           DECIMAL(12,2) NOT NULL,
  retencionDGI  DECIMAL(12,2) NOT NULL,
  total         DECIMAL(12,2) NOT NULL
);
GO

IF OBJECT_ID('dbo.MovimientoInventario') IS NULL
BEGIN
  CREATE TABLE dbo.MovimientoInventario (
    idMovimiento    INT IDENTITY(1,1) PRIMARY KEY,
    idProducto      INT           NOT NULL CONSTRAINT FK_Movimiento_Producto REFERENCES dbo.Producto(idProducto),
    idUsuario       INT           NOT NULL CONSTRAINT FK_Movimiento_Usuario REFERENCES dbo.Usuario(idUsuario),
    tipo            VARCHAR(10)   NOT NULL CONSTRAINT CK_Movimiento_tipo CHECK (tipo IN ('ENTRADA','MERMA','AJUSTE','VENTA','ANULACION')),
    cantidadLibras  DECIMAL(12,3) NOT NULL, -- positivo entra, negativo sale
    stockResultante DECIMAL(12,3) NOT NULL,
    fecha           DATETIME2(0)  NOT NULL CONSTRAINT DF_Movimiento_fecha DEFAULT SYSDATETIME(),
    motivo          NVARCHAR(200) NULL,
    lote            NVARCHAR(40)  NULL,
    idVenta         INT           NULL CONSTRAINT FK_Movimiento_Venta REFERENCES dbo.Venta(idVenta)
  );
  CREATE INDEX IX_Movimiento_producto ON dbo.MovimientoInventario(idProducto, fecha DESC);
  CREATE INDEX IX_Movimiento_fecha ON dbo.MovimientoInventario(fecha DESC);
END
GO

IF OBJECT_ID('dbo.Gasto') IS NULL
BEGIN
  CREATE TABLE dbo.Gasto (
    idGasto        INT IDENTITY(1,1) PRIMARY KEY,
    fecha          DATE          NOT NULL,
    categoria      NVARCHAR(40)  NOT NULL,
    descripcion    NVARCHAR(200) NOT NULL,
    monto          DECIMAL(12,2) NOT NULL CONSTRAINT CK_Gasto_monto CHECK (monto > 0), -- sin IVA
    ivaAcreditable DECIMAL(12,2) NOT NULL CONSTRAINT DF_Gasto_iva DEFAULT 0,
    idUsuario      INT           NOT NULL CONSTRAINT FK_Gasto_Usuario REFERENCES dbo.Usuario(idUsuario),
    creadoEn       DATETIME2(0)  NOT NULL CONSTRAINT DF_Gasto_creado DEFAULT SYSDATETIME()
  );
  CREATE INDEX IX_Gasto_fecha ON dbo.Gasto(fecha);
END
GO

IF OBJECT_ID('dbo.Notificacion') IS NULL
BEGIN
  CREATE TABLE dbo.Notificacion (
    idNotificacion INT IDENTITY(1,1) PRIMARY KEY,
    tipo           VARCHAR(20)   NOT NULL, -- STOCK, CAJA, VENTA, RESPALDO, IMPUESTOS, USUARIOS, SISTEMA
    nivel          VARCHAR(12)   NOT NULL CONSTRAINT CK_Notificacion_nivel CHECK (nivel IN ('INFO','EXITO','ADVERTENCIA','CRITICO')),
    titulo         NVARCHAR(120) NOT NULL,
    mensaje        NVARCHAR(400) NOT NULL,
    roles          VARCHAR(40)   NOT NULL, -- roles que la reciben, separados por coma
    enlace         NVARCHAR(100) NULL,
    clave          NVARCHAR(80)  NULL,     -- evita repetir recordatorios
    fecha          DATETIME2(0)  NOT NULL CONSTRAINT DF_Notificacion_fecha DEFAULT SYSDATETIME()
  );
  CREATE INDEX IX_Notificacion_fecha ON dbo.Notificacion(fecha DESC);
  CREATE UNIQUE INDEX UX_Notificacion_clave ON dbo.Notificacion(clave) WHERE clave IS NOT NULL;
END
GO

IF OBJECT_ID('dbo.NotificacionLeida') IS NULL
CREATE TABLE dbo.NotificacionLeida (
  idNotificacion INT          NOT NULL CONSTRAINT FK_Leida_Notificacion REFERENCES dbo.Notificacion(idNotificacion) ON DELETE CASCADE,
  idUsuario      INT          NOT NULL CONSTRAINT FK_Leida_Usuario REFERENCES dbo.Usuario(idUsuario),
  fecha          DATETIME2(0) NOT NULL CONSTRAINT DF_Leida_fecha DEFAULT SYSDATETIME(),
  CONSTRAINT PK_NotificacionLeida PRIMARY KEY (idNotificacion, idUsuario)
);
GO

IF OBJECT_ID('dbo.Respaldo') IS NULL
CREATE TABLE dbo.Respaldo (
  idRespaldo  INT IDENTITY(1,1) PRIMARY KEY,
  fecha       DATETIME2(0)  NOT NULL CONSTRAINT DF_Respaldo_fecha DEFAULT SYSDATETIME(),
  archivo     NVARCHAR(260) NOT NULL,
  tamanoBytes BIGINT        NULL,
  tipo        VARCHAR(12)   NOT NULL CONSTRAINT CK_Respaldo_tipo CHECK (tipo IN ('MANUAL','AUTOMATICO')),
  estado      VARCHAR(8)    NOT NULL CONSTRAINT CK_Respaldo_estado CHECK (estado IN ('OK','ERROR')),
  copiadoA    NVARCHAR(260) NULL,
  mensaje     NVARCHAR(400) NULL
);
GO

IF OBJECT_ID('dbo.Bitacora') IS NULL
BEGIN
  CREATE TABLE dbo.Bitacora (
    idBitacora INT IDENTITY(1,1) PRIMARY KEY,
    fecha      DATETIME2(0)  NOT NULL CONSTRAINT DF_Bitacora_fecha DEFAULT SYSDATETIME(),
    idUsuario  INT           NULL,
    usuario    NVARCHAR(100) NULL,
    accion     VARCHAR(40)   NOT NULL,
    detalle    NVARCHAR(400) NULL
  );
  CREATE INDEX IX_Bitacora_fecha ON dbo.Bitacora(fecha DESC);
END
GO
