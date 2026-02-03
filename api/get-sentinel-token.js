export default async function handler(req, res) {
    // 1. Configuración de CORS (Para que tu mapa pueda pedir permiso sin bloqueos)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Si el navegador solo está preguntando "si puede pasar" (OPTIONS), le decimos que sí.
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // 2. Tus credenciales de Copernicus (Vercel las leerá de las variables que configuraste)
        const CLIENT_ID = process.env.COPERNICUS_CLIENT_ID;
        const CLIENT_SECRET = process.env.COPERNICUS_CLIENT_SECRET;

        // 3. LA NUEVA URL DE COPERNICUS (Esta es la correcta)
        const TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";

        // 4. Hacemos la petición oficial a Copernicus
        const response = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error_description || 'Error de autenticación con Copernicus');
        }

        // 5. Enviamos el token de vuelta a tu página web
        res.status(200).json(data);

    } catch (error) {
        console.error("Error en el servidor:", error);
        res.status(500).json({ error: error.message });
    }
}