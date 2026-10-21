# Club Deportivo · Gestión de Torneos de Fútbol

Monorepo TypeScript: `backend` (Express + Mongoose + Socket.IO) y `frontend` (React + Vite + Tailwind).

## Despliegue

Docker Compose (backend + nginx + HTTPS opcional con Caddy), imágenes en GHCR y CI/CD con GitHub Actions. Guía completa, variables y lista de seguridad en [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

```bash
cp .env.example .env     # MONGODB_URI, JWT_SECRET (≥32 caracteres), CORS_ORIGIN…
docker compose up -d --build
```

## Puesta en marcha (desarrollo)

```bash
npm install
cp backend/.env.example backend/.env      # completar MONGODB_URI y JWT_SECRET
npm run dev:backend                        # http://localhost:4000
npm run dev:frontend                       # http://localhost:5173
```

## Pruebas automatizadas

Requiere Node 22+. Ejecutor nativo `node:test` vía `tsx`, sin frameworks adicionales.

```bash
npm run test:unit -w backend          # lógica pura, sin base de datos (segundos)
npm run test:integration -w backend   # API completa contra MongoDB en memoria
npm test -w backend                   # ambas
npm run typecheck -w backend          # tipos de src/ y tests/
```

- **Unitarias** (`backend/tests/unit`): rotación de Berger (2–20 equipos, ida y vuelta, equipo libre), siembra y cruces de llaves, desempate por penales, planificador de horarios, zonas horarias con horario de verano, vigencia/orden de patrocinadores y cálculo de estadísticas.
- **Integración** (`backend/tests/integration`): cada archivo levanta su propio MongoDB en memoria (`mongodb-memory-server`) y prueba la API real con `supertest`: autenticación y matriz de roles, fixture, tabla de posiciones en tiempo real (idempotencia, desempates, historial), eventos de partido, llaves hasta el campeón, sedes y conflictos de horario, auditoría, patrocinadores y reportes (PDF y Excel válidos).
- La primera ejecución de integración descarga el binario de MongoDB (~100 MB); queda en caché. Se puede fijar la versión con `MONGOMS_VERSION` y la carpeta con `MONGOMS_DOWNLOAD_DIR`.
- Las pruebas fijan `APP_TIMEZONE=America/Bogota`; no dependen de tu `.env`.
- CI: `.github/workflows/ci.yml` ejecuta typecheck, pruebas y build del frontend en cada push y pull request.

## Flujo de uso

1. Crear el primer Admin con `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run create-admin -w backend` (en Docker: ver `docs/DEPLOYMENT.md`); luego crear Organizadores/Delegados con `POST /api/users` (solo Admin).
2. `POST /api/teams` y `POST /api/teams/:id/players` para armar plantillas (jugadores = usuarios con rol `Jugador`).
3. `POST /api/tournaments` y `POST /api/tournaments/:id/fixture` con `{ "teams": ["<id>", ...] }` para generar el fixture (Berger).
4. En `/match-center` registrar goles y tarjetas; al pasar el partido a `Finished` la tabla se recalcula y se emite por Socket.IO.

## API

| Método | Ruta | Acceso |
| --- | --- | --- |
| POST | `/api/auth/register`, `/api/auth/login` | Público |
| GET | `/api/auth/me` | Autenticado |
| POST | `/api/users` | Admin |
| GET/POST | `/api/teams` · POST `/api/teams/:id/players` | Público / Admin, Organizador, Delegado |
| GET/POST | `/api/tournaments` | Público / Admin, Organizador |
| POST | `/api/tournaments/:id/fixture` | Admin, Organizador |
| GET | `/api/tournaments/:id/standings` · `/matches?round=` · `/leaders` | Público |
| GET | `/api/matches?from=&to=&squads=1` · `/api/matches/:id` | Admin, Organizador |
| PATCH | `/api/matches/:id/status` · `/score` | Admin, Organizador |
| POST/DELETE | `/api/matches/:id/events` · `/events/:eventId` | Admin, Organizador |

## Patrocinadores

| Método | Ruta | Acceso |
| --- | --- | --- |
| GET | `/api/sponsors?tournament=<id>&exclusive=1` | Público (solo nombre, logo, web, categoría, descripción) |
| GET | `/api/sponsors/manage` | Admin, Organizador (incluye contacto, aporte, clics) |
| POST / PATCH | `/api/sponsors`, `/api/sponsors/:id` | Admin, Organizador |
| POST | `/api/sponsors/:id/click` | Público |
| GET | `/api/reports/sponsors?format=json\|pdf\|xlsx` | Admin, Organizador |

- Categorías: Principal, Oro, Plata y Bronce (orden de aparición: categoría y luego nombre).
- Un patrocinador sin torneos aplica a todo el club (pie de página); con torneos, se muestra en la página de cada uno (`exclusive=1` evita duplicarlo con el pie).
- Solo se muestran los activos dentro de su vigencia (`startDate`/`endDate`). Los datos de contacto y el aporte nunca salen en el endpoint público.
- Los campos opcionales se limpian enviando `null` en el `PATCH`.
- El contador de clics es indicativo: se limita a 1 por IP y patrocinador cada 10 s (en memoria, por proceso), pero un endpoint público no es a prueba de manipulación.
- Logos por URL (https); no hay subida de archivos.

## Registro de actividad (auditoría)

| Método | Ruta | Acceso |
| --- | --- | --- |
| GET | `/api/audit?page=&limit=&entityType=&entityId=&actor=&action=&from=&to=` | Admin |
| GET | `/api/reports/audit?format=json\|pdf\|xlsx` (mismos filtros, hasta 5000 filas) | Admin |

- Se registran: inicios de sesión (y fallidos), altas de usuarios, equipos y jugadores añadidos, torneos, fixture, llaves, programación, sedes y, en cada partido, cambios de estado, marcador (antes → después), eventos y reprogramaciones.
- `audit(req, {...})` es no bloqueante: si el registro falla, solo se escribe en consola y la operación principal no se ve afectada. Nunca se guardan contraseñas ni tokens.
- Los registros son de solo lectura (no hay endpoints de edición ni borrado) y se purgan solos tras `AUDIT_RETENTION_DAYS` (365 por defecto) mediante un índice TTL.
- `action` filtra por prefijo (`match.` trae todas las acciones de partidos; `auth.login_failed` solo los intentos fallidos).
- Frontend: `/audit` (solo Admin) con filtros, paginación, detalle JSON por registro y exportación a PDF/Excel.

## Sedes, canchas y programación

| Método | Ruta | Acceso |
| --- | --- | --- |
| GET | `/api/venues` | Público |
| POST / PATCH | `/api/venues`, `/api/venues/:id` | Admin, Organizador |
| PATCH | `/api/matches/:id/schedule` `{ venueId, fieldId, date?, durationMinutes? }` (`venueId: null` quita la cancha) | Admin, Organizador |
| POST | `/api/tournaments/:id/schedule` `{ fieldIds, slotTimes: ["09:00","11:00"], durationMinutes?, stage? }` | Admin, Organizador |

- Una sede tiene varias canchas; las canchas no se eliminan, se desactivan (`isActive: false`), para no romper partidos ya programados.
- **Conflictos:** al programar manualmente se rechaza (409) si la cancha está ocupada en ese intervalo o si alguno de los equipos ya juega en él. Los partidos duran `durationMinutes` (90 por defecto, 30–240) y las canchas se comparten entre torneos.
- **Programación automática:** toma los partidos `Scheduled` sin cancha y, jornada por jornada, llena las canchas en paralelo franja por franja respetando partidos ya existentes. Los que no caben se reportan como "sin cupo". Las franjas `HH:MM` se interpretan en `APP_TIMEZONE` (cambios de horario de verano incluidos).
- `APP_TIMEZONE` (por defecto `America/Bogota`) reemplaza a `REPORT_TIMEZONE` y se usa en reportes y programación.

## Eliminación directa (torneos Mixtos)

| Método | Ruta | Acceso |
| --- | --- | --- |
| GET | `/api/tournaments/:id/bracket` | Público |
| POST | `/api/tournaments/:id/knockout` `{ "qualifiers": 8 }` | Admin, Organizador |
| POST | `/api/tournaments/:id/knockout/advance` | Admin, Organizador |

1. Con todos los partidos de grupos en `Finished`, `knockout` toma los N primeros de la tabla (N potencia de 2) y los siembra 1° vs último, de modo que los mejores sembrados solo se cruzan en rondas avanzadas.
2. Cada ronda se crea cuando termina la anterior (`advance`); en la final, `advance` cierra el torneo (`Finalizado`) y el cuadro muestra al campeón.
3. Un partido de eliminación directa no puede pasar a `Finished` empatado: hay que registrar penales (`PATCH /api/matches/:id/score` con `penalties: { local, visitor }`; el modal del Match Center los pide).
4. `GET /api/tournaments/:id/matches?stage=Fase de grupos` filtra por fase (el fixture del frontend usa este filtro, ya que las rondas de ambas fases se numeran desde 1).

## Reportes

`GET /api/reports/...?format=json|pdf|xlsx` (opcional `&tournament=<id>` en equipo y jugador):

| Ruta | Acceso |
| --- | --- |
| `/tournaments/:id` (posiciones, goleadores, valla, resultados) | Admin, Organizador |
| `/tournaments/:id/sanctions` (tarjetas por jugador) | Admin, Organizador |
| `/teams/:id` (historial, plantilla, partidos) | Admin, Organizador; Delegado solo su equipo |
| `/players/:id` (resumen y eventos) | Admin, Organizador |

Cada builder devuelve un `ReportData` genérico (secciones con columnas y filas); `pdf.exporter.ts` (pdfkit) y `excel.exporter.ts` (exceljs) lo renderizan, así que un reporte nuevo solo requiere un builder. En el frontend, `/reports` muestra la vista previa y permite descargar PDF/Excel o imprimir.
Zona horaria de las fechas: `APP_TIMEZONE` (por defecto `America/Bogota`).

## Tiempo real

Un `save()` de `Match` que cambia el estado (o el marcador estando `Finished`) emite `match:resultChanged` en el bus de dominio. `standings.service` lo escucha, recalcula desde los partidos finalizados (idempotente, sin doble conteo), actualiza `Standing` y el historial del `Team`, y emite `standings:updated` a la sala `tournament:<id>`.
# club-torneos-v1.1
# club-torneos-v1.1
