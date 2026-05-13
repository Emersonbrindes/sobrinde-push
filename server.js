const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Inicializa Firebase Admin com a service account
// A service account JSON será configurada como variável de ambiente no Render
let firebaseInitialized = false;

function initFirebase() {
  if (firebaseInitialized) return;
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'rankinkg-semanal-so-brinde'
    });
    firebaseInitialized = true;
    console.log('Firebase Admin inicializado!');
  } catch (e) {
    console.error('Erro ao inicializar Firebase:', e.message);
  }
}

// Rota de saúde
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Copa Só Brinde — Push Server' });
});

// Rota para enviar notificação
app.post('/notificar', async (req, res) => {
  initFirebase();
  if (!firebaseInitialized) {
    return res.status(500).json({ erro: 'Firebase não inicializado' });
  }

  const { titulo, corpo, repId } = req.body;
  if (!titulo || !corpo) {
    return res.status(400).json({ erro: 'titulo e corpo são obrigatórios' });
  }

  try {
    const db = admin.firestore();

    // Busca todos os tokens FCM
    const snapshot = await db.collection('fcm_tokens').get();
    const tokens = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.token) tokens.push(data.token);
    });

    if (tokens.length === 0) {
      return res.json({ sucesso: true, enviados: 0, msg: 'Nenhum token cadastrado' });
    }

    // Envia notificação para todos os tokens
    const message = {
      notification: {
        title: titulo,
        body: corpo
      },
      webpush: {
        notification: {
          title: titulo,
          body: corpo,
          icon: 'https://copa-sobrinde.netlify.app/icons/icon-192.png',
          badge: 'https://copa-sobrinde.netlify.app/icons/icon-192.png',
          vibrate: [200, 100, 200],
          requireInteraction: false
        },
        fcmOptions: {
          link: 'https://copa-sobrinde.netlify.app/app.html'
        }
      },
      tokens: tokens
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`Enviado: ${response.successCount} sucesso, ${response.failureCount} falha`);

    // Remove tokens inválidos
    const tokensParaRemover = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        tokensParaRemover.push(tokens[idx]);
        console.log('Token inválido:', tokens[idx].substring(0, 20));
      }
    });

    // Salva notificação no histórico
    await db.collection('notificacoes').add({
      titulo,
      corpo,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      enviados: response.successCount,
      falhas: response.failureCount
    });

    res.json({
      sucesso: true,
      enviados: response.successCount,
      falhas: response.failureCount,
      total: tokens.length
    });

  } catch (e) {
    console.error('Erro ao enviar:', e);
    res.status(500).json({ erro: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  initFirebase();
});
