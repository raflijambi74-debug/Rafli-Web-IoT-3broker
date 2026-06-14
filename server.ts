import express from "express";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Server as SocketIOServer } from "socket.io";
import { createServer } from "http";
import mqtt from "mqtt";

async function startServer() {
  const app = express();
  app.use(cors());
  const PORT = 3000;
  const httpServer = createServer(app);
  
  // Set up Socket.IO
  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*" }
  });

  io.on("connection", (socket) => {
    let mqttClient: mqtt.MqttClient | null = null;
    console.log("Client connected via Socket.IO:", socket.id);

    socket.on("connect_mqtt", (config) => {
      console.log("Connecting to MQTT with config:", { ...config, password: "***" });
      
      const { server, port, username, password, clientId } = config;
      // Build protocol based on port (very crude but functional)
      let protocol = "mqtts";
      if (port == 1883) protocol = "mqtt";
      if (port == 443 || port == 8084 || port == 8083) protocol = "wss";
      
      const brokerUrl = `${protocol}://${server}:${port}`;
      console.log(`Connecting to MQTT broker URL: ${brokerUrl}`);

      try {
        if (mqttClient) {
          mqttClient.end();
        }

        mqttClient = mqtt.connect({
          protocol: protocol as any,
          host: server,
          port: Number(port),
          clientId,
          username,
          password,
          clean: true,
          connectTimeout: 10000,
          reconnectPeriod: 5000,
          rejectUnauthorized: false // some test brokers need this
        });

        mqttClient.on('connect', () => {
          console.log(`MQTT Connected for socket ${socket.id}`);
          socket.emit("mqtt_status", "connected");
          mqttClient?.subscribe("sensor/suhu");
          mqttClient?.subscribe("sensor/kelembaban");
          mqttClient?.subscribe("status/broker");
        });

        mqttClient.on('message', (topic, message) => {
          socket.emit("mqtt_message", { topic, message: message.toString() });
        });

        mqttClient.on('error', (err) => {
          console.error(`MQTT Error for ${socket.id}:`, err);
          let errMsg = err.message || err.toString();
          if (errMsg.includes('Server unavailable') || errMsg.includes('Not authorized')) {
             errMsg += " (Tips: Cek kembali Client ID, Username, dan Password, atau pastikan Device sudah terdaftar di dashboard MyQttHub)";
          }
          socket.emit("mqtt_error", errMsg);
        });

        mqttClient.on('offline', () => {
          socket.emit("mqtt_status", "disconnected");
        });

      } catch (err: any) {
        console.error("MQTT Connect Exception:", err);
        socket.emit("mqtt_error", err.toString());
      }
    });

    socket.on("publish_mqtt", ({ topic, message }) => {
      if (mqttClient && mqttClient.connected) {
        mqttClient.publish(topic, message);
      } else {
        console.warn(`Cannot publish to ${topic}, MQTT not connected.`);
      }
    });

    socket.on("disconnect_mqtt", () => {
      if (mqttClient) {
        mqttClient.end();
        mqttClient = null;
        socket.emit("mqtt_status", "disconnected");
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected via Socket.IO:", socket.id);
      if (mqttClient) {
        mqttClient.end();
      }
    });
  });

  // API route examples
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // NOTE: Listen on httpServer instead of app
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
