/*
 * Campus CO2 · Módulo 8 · Compras y cadena de suministro
 * Configuración del módulo.
 *
 * Todo lo que depende de la API central de la cátedra está acá, para que cuando
 * entreguen la documentación sólo haya que tocar este archivo (y, si cambian los
 * nombres de los campos, los adaptadores al final de js/api.js).
 *
 * NO poner credenciales en este archivo: se sube al repositorio.
 */
(function (global) {
  'use strict';

  var config = {
    api: {
      // Completar con la dirección base que entregue la cátedra, sin barra final.
      // Ejemplo: 'https://campusco2.frc.utn.edu.ar/api/v1'
      // También se puede cargar desde la pestaña "Conexión" (queda guardada en el navegador).
      // Por ahora apunta a la API simulada de mock-api/server.js (ver mock-api/README.md).
      baseUrl: 'http://localhost:3001',

      timeoutMs: 10000,

      // Rutas relativas a baseUrl. Ajustarlas a la documentación de la API.
      endpoints: {
        periodos: '/periodos',
        edificios: '/edificios',
        unidades: '/unidades',
        fuentes: '/fuentes-datos',
        factores: '/factores-emision',        // GET ?bien=papel&anio=2026
        datosActividad: '/datos-actividad',   // GET ?dimension_id=8 · POST
        resultados: '/resultados-emision'     // GET ?dimension_id=8 · POST
      }
    },

    // Dimensión del módulo en la base central y su clasificación GHG Protocol.
    dimension: {
      id: 8,
      nombre: 'Compras y cadena de suministro',
      alcance: 3,
      categoria: 1
    },

    // Rubros del módulo. "bien" es el nombre con el que se busca el factor en la API.
    // El papel higiénico reutiliza el factor del papel por indicación de la cátedra.
    rubros: {
      actas:   { clave: 'actas',   nombre: 'Papelería de actas', corto: 'Actas de examen', bien: 'papel', serie: 1 },
      papelHig:{ clave: 'papelHig',nombre: 'Papel higiénico',    corto: 'Papel higiénico', bien: 'papel', serie: 2 },
      jabon:   { clave: 'jabon',   nombre: 'Jabón líquido',      corto: 'Jabón líquido',   bien: 'jabon liquido', serie: 3 }
    },

    // Departamentos de la Tabla 6. No son una entidad de la base central:
    // viajan como atributo "departamento" del dato de actividad.
    departamentos: [
      'Materias Básicas',
      'Ingeniería Civil',
      'Ingeniería Electrónica',
      'Ingeniería en Energía Eléctrica',
      'Ingeniería en Sistemas de Información',
      'Ingeniería Industrial',
      'Ingeniería Mecánica',
      'Ingeniería Metalúrgica',
      'Ingeniería Química'
    ],

    // Valores sugeridos de la Tabla 9. Se precargan en los formularios y se pueden cambiar.
    sugeridos: {
      turnos: 7,            // Resolución 2126/25, Calendario Académico 2026
      hojasPorActa: 3,      // acta triple (indicación de la cátedra)
      pesoHojaKg: 0.005,    // A4 80 g/m² ≈ 0,0624 m² × 80 g/m² ≈ 5 g (supuesto)
      densidadJabon: 1.0    // kg/L, sólo si el jabón se carga en litros (supuesto, citar fuente)
    },

    calidades: ['medido', 'estimado', 'supuesto'],

    // Listas de respaldo: sólo se usan si la API no responde, para poder completar
    // el formulario y ver el cálculo. Con la API caída no se envía nada.
    respaldo: {
      periodos: [{ id: 'local-2026', anio: 2026, nombre: '2026' }],
      edificios: [
        { id: 'local-1', nombre: 'Edificio 1' },
        { id: 'local-2', nombre: 'Edificio 2' },
        { id: 'local-3', nombre: 'Edificio 3' },
        { id: 'local-4', nombre: 'Edificio 4' },
        { id: 'local-5', nombre: 'Edificio 5' }
      ]
    },

    // Claves de localStorage (sólo preferencias y borradores del formulario)
    storage: {
      conexion: 'campusco2.m8.conexion',
      borradores: 'campusco2.m8.borradores',
      factoresManuales: 'campusco2.m8.factoresManuales'
    }
  };

  global.CampusCO2 = global.CampusCO2 || {};
  global.CampusCO2.config = config;
  if (typeof module !== 'undefined' && module.exports) module.exports = config;
})(typeof window !== 'undefined' ? window : globalThis);
