import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Thermometer, 
  Droplets, 
  Power, 
  RefreshCcw, 
  Settings, 
  Wifi, 
  WifiOff, 
  AlertCircle,
  Activity,
  Terminal,
  Trash2,
  Zap,
  ZapOff,
  Wand2,
  Eye,
  EyeOff,
  Link,
  Unlink,
  Mic,
  MicOff
} from 'lucide-react';
import { cn } from './lib/utils';

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface LogEntry {
  id: string;
  time: string;
  message: string;
  type: 'info' | 'success' | 'warn' | 'error';
}

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [errorMsg, setErrorMsg] = useState('');
  
  // Connection Settings
  const [showSettings, setShowSettings] = useState(false);
  const [preset, setPreset] = useState('myqtthub');
  const [serverEndpoint, setServerEndpoint] = useState('node02.myqtthub.com'); 
  const [port, setPort] = useState('8883');
  const [username, setUsername] = useState('rafliuser12');
  const [password, setPassword] = useState('123');
  const [clientId, setClientId] = useState('web_client');
  const [showPassword, setShowPassword] = useState(false);
  const [connectedServer, setConnectedServer] = useState('');
  const [isListening, setIsListening] = useState(false);

  // Sensor Data
  const [temperature, setTemperature] = useState<string>('--');
  const [humidity, setHumidity] = useState<string>('--');

  const tempRef = useRef(temperature);
  const humRef = useRef(humidity);
  useEffect(() => { tempRef.current = temperature; }, [temperature]);
  useEffect(() => { humRef.current = humidity; }, [humidity]);

  // Activity Log
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Bulk / Variable Loop Timer
  const bulkLoopTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const addLog = (msg: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => {
      const newLogs = [{
        id: Math.random().toString(36).substr(2, 9),
        time: new Date().toLocaleTimeString(),
        message: msg,
        type
      }, ...prev];
      // Keep only last 50 logs to prevent memory issues, top-down
      return newLogs.slice(0, 50);
    });
  };

  const clearLogs = () => setLogs([]);

  // Auto-scroll logs (scroll to top)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs]);

  // Relay States
  const [relays, setRelays] = useState([
    { id: 1, name: 'Relay 1 (D0)', state: false, looping: false },
    { id: 2, name: 'Relay 2 (D1)', state: false, looping: false },
    { id: 3, name: 'Relay 3 (D2)', state: false, looping: false },
    { id: 4, name: 'Relay 4 (D3)', state: false, looping: false },
  ]);

  // Timers for looping
  const loopTimers = useRef<{ [key: number]: ReturnType<typeof setInterval> }>({});

  useEffect(() => {
    // Connect to local socket.io backend wrapper
    const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
    const newSocket = io(backendUrl, { autoConnect: true });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      addLog('Terhubung ke sistem backend lokal.', 'info');
    });

    newSocket.on('mqtt_status', (newStatus: string) => {
      if (newStatus === 'connected') {
        setStatus('connected');
        setShowSettings(false);
        addLog(`Berhasil terhubung ke broker ${serverEndpoint}:${port}`, 'success');
      } else if (newStatus === 'disconnected') {
        setStatus('disconnected');
        addLog('Terputus dari broker MQTT.', 'warn');
      }
    });

    newSocket.on('mqtt_message', ({ topic, message }) => {
      if (topic === 'sensor/suhu') {
        setTemperature(message);
      } else if (topic === 'sensor/kelembaban') {
        setHumidity(message);
      } else if (topic === 'status/broker') {
        addLog(`ESP8266 ${message}`, 'success');
      } else {
        addLog(`[${topic}] ${message}`, 'info');
      }
    });

    newSocket.on('mqtt_error', (err: string) => {
      setStatus('error');
      setErrorMsg(err);
      addLog(`MQTT Error: ${err}`, 'error');
    });

    return () => {
      newSocket.disconnect();
      Object.values(loopTimers.current).forEach(clearInterval);
    };
  }, []); // Empty deps because we only want one socket instance

  const handlePresetChange = (newPreset: string) => {
    setPreset(newPreset);
    let newServer = '';
    let newPort = '8883';
    let newUser = '';
    let newPass = '';
    let newClientId = '';
    let brokerIdx = '1';

    if (newPreset === 'myqtthub') {
      newServer = 'node02.myqtthub.com';
      newUser = 'rafliuser12';
      newPass = '123';
      newClientId = 'web_client';
      brokerIdx = '1';
    } else if (newPreset === 'flespi') {
      newServer = 'mqtt.flespi.io';
      newUser = 'wUBDyNSeByJS8EzKBwytOYvNIo6PTV6t2Uv4QebFVhEgwFKAb2YprfNSaUZYlBna';
      newPass = '';
      newClientId = '';
      brokerIdx = '2';
    } else if (newPreset === 'ably') {
      newServer = 'mqtt.ably.io';
      newUser = 'jS-Azw.k5X7NA';
      newPass = '2ufRbWJ5dqv2o5NTT5M_OSc9YJCqvP3TTPed4qpm760';
      newClientId = '';
      brokerIdx = '3';
    }

    setServerEndpoint(newServer);
    setPort(newPort);
    setUsername(newUser);
    setPassword(newPass);
    setClientId(newClientId);
  };

  const connectMqtt = () => {
    setStatus('connecting');
    setErrorMsg('');
    setConnectedServer(serverEndpoint);
    addLog(`Menghubungkan ke ${serverEndpoint}:${port}...`, 'info');
    
    if (socket) {
      socket.emit('connect_mqtt', {
        server: serverEndpoint,
        port,
        username,
        password,
        clientId
      });
    }
  };

  const disconnectMqtt = () => {
    if (socket) {
      socket.emit('disconnect_mqtt');
      addLog('Memutuskan koneksi...', 'warn');
    }
  };

  const toggleRelay = (id: number, forceState?: boolean) => {
    setRelays((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const newState = forceState !== undefined ? forceState : !r.state;
          const command = newState ? 'ON' : 'OFF';
          
          if (socket && status === 'connected') {
            socket.emit('publish_mqtt', { topic: `kontrol/relay${id}`, message: command });
            addLog(`⚡ Relay ${id} diatur ke ${command}`, 'info');
            speakText(`Relay ${id} berhasil di ${newState ? 'nyalakan' : 'matikan'}`);
          }
          
          return { ...r, state: newState };
        }
        return r;
      })
    );
  };

  const executeBulkAction = (action: 'all_on' | 'all_off' | 'var1' | 'var2' | 'stop_var') => {
    addLog(`Mengirim skenario ke ESP8266: ${action.replace('_', ' ').toUpperCase()}`, 'info');
    
    let speakMessage = '';
    if (action === 'all_on') speakMessage = 'Semua relay berhasil dinyalakan';
    else if (action === 'all_off') speakMessage = 'Semua relay berhasil dimatikan';
    else if (action === 'var1') speakMessage = 'Variasi satu berhasil dihidupkan';
    else if (action === 'var2') speakMessage = 'Variasi dua berhasil dihidupkan';
    else if (action === 'stop_var') speakMessage = 'Variasi berhasil dihentikan';
    speakText(speakMessage);

    // Stop any existing web-side bulk loop just in case
    if (bulkLoopTimer.current) {
      clearInterval(bulkLoopTimer.current);
      bulkLoopTimer.current = null;
    }

    if (socket && status === 'connected') {
      socket.emit('publish_mqtt', { topic: `kontrol/bulk`, message: action.toUpperCase() });
    }

    // Update local state estimation for non-looping commands
    if (action === 'all_on' || action === 'all_off' || action === 'stop_var') {
      const newState = action === 'all_on';
      setRelays(prev => prev.map(r => {
        // Stop local individual looping if any
        if (r.looping && loopTimers.current[r.id]) {
          clearInterval(loopTimers.current[r.id]);
          delete loopTimers.current[r.id];
        }
        return { ...r, state: newState, looping: false };
      }));
    }
  };

  const toggleLooping = (id: number) => {
    setRelays((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const newLoopingState = !r.looping;
          
          if (newLoopingState) {
            addLog(`🔄 Memulai auto-loop Relay ${id}`, 'info');
            if (loopTimers.current[id]) clearInterval(loopTimers.current[id]);
            toggleRelay(id);
            loopTimers.current[id] = setInterval(() => {
              setRelays((currentRelays) => {
                const target = currentRelays.find(cr => cr.id === id);
                if (target && socket && status === 'connected') {
                  const cmd = !target.state ? 'ON' : 'OFF';
                  socket.emit('publish_mqtt', { topic: `kontrol/relay${id}`, message: cmd });
                }
                return currentRelays.map(cr => cr.id === id ? { ...cr, state: !cr.state } : cr);
              });
            }, 2000); 
          } else {
            addLog(`⏹️ Menghentikan auto-loop Relay ${id}`, 'warn');
            if (loopTimers.current[id]) {
              clearInterval(loopTimers.current[id]);
              delete loopTimers.current[id];
            }
          }
          
          return { ...r, looping: newLoopingState };
        }
        return r;
      })
    );
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID';
      window.speechSynthesis.speak(utterance);
    }
  };

  const processVoiceCommand = (command: string) => {
    if (command.includes('suhu') || command.includes('kelembaban')) {
      const msg = `Suhu saat ini adalah ${tempRef.current} derajat celcius, dan kelembaban ${humRef.current} persen.`;
      addLog(`🤖 ${msg}`, 'success');
      speakText(msg);
      return;
    }

    if (command.includes('semua')) {
      if (command.includes('hidupkan') || command.includes('nyalakan')) {
        executeBulkAction('all_on');
      } else if (command.includes('matikan')) {
        executeBulkAction('all_off');
      }
      return;
    }

    if (command.includes('variasi 1') || command.includes('variasi satu')) {
      executeBulkAction('var1');
      return;
    }
    if (command.includes('variasi 2') || command.includes('variasi dua')) {
      executeBulkAction('var2');
      return;
    }
    if (command.includes('tutup variasi') || command.includes('stop variasi') || command.includes('berhenti')) {
      executeBulkAction('stop_var');
      return;
    }

    const matches = command.match(/(hidupkan|nyalakan|matikan)\s+(relay|lampu)\s+(\d)/);
    if (matches) {
      const action = matches[1];
      const num = parseInt(matches[3]);
      if (num >= 1 && num <= 4) {
        const forceState = (action === 'hidupkan' || action === 'nyalakan');
        toggleRelay(num, forceState);
      }
    } else {
      speakText('Maaf, perintah tidak dikenali.');
    }
  };

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addLog('Browser tidak mendukung fitur voice command.', 'error');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.interimResults = false;
    recognition.continuous = true; // Dengarkan terus sampai dihentikan atau dapet hasil

    let listeningTimeout: NodeJS.Timeout;

    recognition.onstart = () => {
      setIsListening(true);
      addLog('🎙️ Mendengarkan... (Max 10 detik)', 'info');
      // Beri batas waktu otomatis mati max 10 detik kalau pengguna diam
      listeningTimeout = setTimeout(() => {
        if (recognition) recognition.stop();
        addLog('⏱️ Waktu mendengarkan habis.', 'warn');
      }, 10000);
    };

    recognition.onresult = (event: any) => {
      clearTimeout(listeningTimeout);
      const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
      addLog(`🗣️ Didengarkan: "${transcript}"`, 'info');
      processVoiceCommand(transcript);
      recognition.stop(); // otomatis mematikan mic setelah dapat command
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') return; // abaikan kalau ga ada suara biar tetep jalan
      clearTimeout(listeningTimeout);
      addLog(`❌ Gagal mendengarkan: ${event.error}`, 'error');
      setIsListening(false);
    };

    recognition.onend = () => {
      clearTimeout(listeningTimeout);
      setIsListening(false);
    };

    try {
      recognition.start();
    } catch (e) {
      setIsListening(false);
      addLog('❌ Gagal memulai voice command.', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-emerald-500/30">
      {/* Navbar Section */}
      <nav className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="text-emerald-500" />
            <h1 className="font-semibold tracking-tight text-lg flex items-center gap-2">
              MyQttHub Controller
              <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Proxy</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={startListening}
                disabled={isListening}
                className={cn(
                  "p-2 rounded-full transition-all flex items-center justify-center",
                  isListening 
                    ? "bg-red-500/20 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]" 
                    : "bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700"
                )}
                title="Voice Command"
              >
                {isListening ? <Mic className="w-5 h-5 animate-pulse" /> : <MicOff className="w-5 h-5" />}
              </button>
              
              <button
                onClick={status === 'connected' ? disconnectMqtt : connectMqtt}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 border",
                  status === 'connected' 
                    ? "bg-red-500/10 text-red-500 border-red-500/30 hover:bg-red-500/20"
                    : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20"
                )}
              >
                {status === 'connected' ? <><Unlink className="w-4 h-4"/> Putuskan</> : <><Link className="w-4 h-4"/> Hubungkan</>}
              </button>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              {status === 'connected' ? (
                <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-full border border-emerald-400/20 max-w-[200px] sm:max-w-xs truncate overflow-hidden whitespace-nowrap block" title={`Terhubung ke: ${connectedServer || serverEndpoint}`}>
                  <Wifi className="w-4 h-4 shrink-0 inline mr-1" /> <span className="truncate">Terhubung ke: {connectedServer || serverEndpoint}</span>
                </span>
              ) : status === 'connecting' ? (
                <span className="flex items-center gap-1.5 text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-full border border-amber-400/20">
                  <RefreshCcw className="w-4 h-4 animate-spin" /> Connecting...
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-red-400 bg-red-400/10 px-2.5 py-1 rounded-full border border-red-400/20">
                  <WifiOff className="w-4 h-4" /> Disconnected
                </span>
              )}
            </div>
            
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 hover:bg-neutral-800 rounded-full transition-colors flex items-center gap-2"
            >
              <Settings className="w-5 h-5 text-neutral-400" />
              <span className="text-sm font-medium hidden sm:block text-neutral-300">Broker Settings</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {/* Settings Panel */}
        {showSettings && (
          <div className="mb-8 p-6 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-xl animate-in fade-in slide-in-from-top-4">
            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5" /> Broker Settings
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <div className="space-y-1 lg:col-span-5 mb-2 border-b border-neutral-800 pb-4">
                <label className="text-xs text-neutral-400 font-medium">Broker Preset (Pilihan Cepat)</label>
                <select
                  value={preset}
                  onChange={(e) => handlePresetChange(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none appearance-none"
                >
                  <option value="myqtthub">MyQttHub</option>
                  <option value="flespi">Flespi</option>
                  <option value="ably">Ably</option>
                </select>
              </div>
              <div className="space-y-1 lg:col-span-2">
                <label className="text-xs text-neutral-400 font-medium">Server (Host)</label>
                <input
                  type="text"
                  value={serverEndpoint}
                  onChange={(e) => setServerEndpoint(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="node02.myqtthub.com"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-neutral-400 font-medium">Port</label>
                <select
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none appearance-none"
                >
                  <option value="8883">8883 (MQTTS)</option>
                  <option value="1883">1883 (MQTT)</option>
                  <option value="443">443 (WSS)</option>
                </select>
              </div>
              <div className="space-y-1 lg:col-span-2">
                <label className="text-xs text-neutral-400 font-medium">Client ID</label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div className="space-y-1 lg:col-span-2">
                <label className="text-xs text-neutral-400 font-medium">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div className="space-y-1 lg:col-span-3">
                <label className="text-xs text-neutral-400 font-medium">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none pr-10"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            
            {errorMsg && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {errorMsg}
              </div>
            )}
            
            <div className="flex gap-3">
              <button
                onClick={status === 'connected' ? disconnectMqtt : connectMqtt}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2",
                  status === 'connected' 
                    ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                    : "bg-emerald-500 text-neutral-950 hover:bg-emerald-400"
                )}
              >
                {status === 'connected' ? 'Disconnect' : 'Connect to Broker'}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Environment Section */}
          <div className="lg:col-span-1 space-y-6">
            <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-widest">Environment (D4)</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl flex flex-col items-center justify-center text-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="w-12 h-12 bg-orange-500/10 text-orange-500 rounded-full flex items-center justify-center mb-3">
                  <Thermometer className="w-6 h-6" />
                </div>
                <div className="text-3xl font-light tracking-tight mb-1">
                  {temperature}<span className="text-lg text-neutral-500 ml-1">°C</span>
                </div>
                <div className="text-xs text-neutral-500 font-medium">Temperature</div>
              </div>
              
              <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl flex flex-col items-center justify-center text-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="w-12 h-12 bg-blue-500/10 text-blue-500 rounded-full flex items-center justify-center mb-3">
                  <Droplets className="w-6 h-6" />
                </div>
                <div className="text-3xl font-light tracking-tight mb-1">
                  {humidity}<span className="text-lg text-neutral-500 ml-1">%</span>
                </div>
                <div className="text-xs text-neutral-500 font-medium">Humidity</div>
              </div>
            </div>
            
            {/* Activity Log Panel */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col flex-1 min-h-[16rem] shadow-xl">
              <div className="p-3 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/50">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-xs font-medium text-neutral-300 uppercase tracking-widest">Log Aktifitas</h3>
                </div>
                <button
                  onClick={clearLogs}
                  className="p-1.5 hover:bg-neutral-800 rounded-md transition-colors text-neutral-400 hover:text-red-400 flex items-center gap-1 text-[10px] uppercase font-bold"
                  title="Hapus Riwayat"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Hapus
                </button>
              </div>
              <div 
                ref={scrollRef}
                className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-2 bg-[#0a0a0a]"
              >
                {logs.length === 0 ? (
                  <div className="text-neutral-600 italic h-full flex items-center justify-center">Menunggu aktifitas...</div>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="flex gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                      <span className="text-neutral-600 shrink-0">{log.time}</span>
                      <span className={cn(
                        "break-all text-emerald-400", // Default color
                        log.type === 'error' && "text-red-400",
                        log.type === 'warn' && "text-amber-400",
                        log.type === 'info' && "text-emerald-400",
                        log.type === 'success' && "text-emerald-300 font-bold"
                      )}>
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Relay Controls Section */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-widest">Relay Controls</h2>
              <span className="text-[10px] font-bold text-neutral-500 bg-neutral-900 px-2 py-1 rounded border border-neutral-800 uppercase tracking-wider">
                Active LOW (ON = LOW)
              </span>
            </div>

            {/* Bulk Controls */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-wrap gap-2 items-center">
              <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider mr-2">Skenario Massal:</div>
              <button 
                onClick={() => executeBulkAction('all_on')}
                disabled={status !== 'connected'}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Zap className="w-3.5 h-3.5" /> Hidupkan Semua
              </button>
              <button 
                onClick={() => executeBulkAction('all_off')}
                disabled={status !== 'connected'}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ZapOff className="w-3.5 h-3.5" /> Matikan Semua
              </button>
              <div className="w-px h-6 bg-neutral-800 mx-1 hidden sm:block"></div>
              <button 
                onClick={() => executeBulkAction('var1')}
                disabled={status !== 'connected'}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Wand2 className="w-3.5 h-3.5" /> Variasi 1
              </button>
              <button 
                onClick={() => executeBulkAction('var2')}
                disabled={status !== 'connected'}
                className="flex items-center gap-1.5 px-3 py-2 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/20 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Wand2 className="w-3.5 h-3.5" /> Variasi 2
              </button>
              <button 
                onClick={() => executeBulkAction('stop_var')}
                disabled={status !== 'connected'}
                className="flex items-center gap-1.5 px-3 py-2 bg-neutral-500/10 text-neutral-400 hover:bg-neutral-500/20 border border-neutral-500/20 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ZapOff className="w-3.5 h-3.5" /> Stop Variasi
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {relays.map((relay) => (
                <div key={relay.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex flex-col relative overflow-hidden group">
                  
                  {/* Status Indicator Bar */}
                  <div className={cn(
                    "absolute top-0 left-0 w-full h-1 transition-colors duration-300",
                    relay.state ? "bg-emerald-500" : "bg-neutral-800 group-hover:bg-neutral-700"
                  )} />

                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="font-medium text-lg tracking-tight text-white mb-1">{relay.name}</h3>
                      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-neutral-950 border border-neutral-800">
                        <div className={cn("w-1.5 h-1.5 rounded-full", relay.state ? "bg-emerald-500 animate-pulse" : "bg-neutral-600")} />
                        <span className="font-mono text-[10px] text-neutral-400">kontrol/relay{relay.id}</span>
                      </div>
                    </div>
                    
                    {/* Power Toggle Button */}
                    <button
                      onClick={() => toggleRelay(relay.id)}
                      disabled={relay.looping || status !== 'connected'}
                      className={cn(
                        "w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-4 focus:ring-offset-neutral-900 shadow-xl",
                        relay.state 
                          ? "bg-emerald-500 text-neutral-950 shadow-[0_0_30px_rgba(16,185,129,0.4)] hover:bg-emerald-400 focus:ring-emerald-500" 
                          : "bg-neutral-800 text-neutral-400 border border-neutral-700 hover:bg-neutral-700 focus:ring-neutral-500",
                        (relay.looping || status !== 'connected') && "opacity-50 cursor-not-allowed hidden-shadow"
                      )}
                    >
                      <Power className={cn("w-6 h-6", relay.state && "drop-shadow-sm")} />
                    </button>
                  </div>

                  <div className="mt-auto pt-4 border-t border-neutral-800/50 flex items-center justify-between">
                    <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider flex items-center gap-1">
                      <RefreshCcw className={cn("w-3.5 h-3.5", relay.looping && "animate-spin text-emerald-400")} /> Auto Loop
                    </span>
                    <button
                      onClick={() => toggleLooping(relay.id)}
                      disabled={status !== 'connected'}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-neutral-900 border",
                        relay.looping ? "bg-emerald-500 border-emerald-500" : "bg-neutral-800 border-neutral-700",
                        status !== 'connected' && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                          relay.looping ? "translate-x-6" : "translate-x-1"
                        )}
                      />
                    </button>
                  </div>

                  {relay.looping && (
                    <div className="absolute inset-0 pointer-events-none rounded-2xl border-2 border-emerald-500/20 opacity-50 mix-blend-screen" />
                  )}
                </div>
              ))}
            </div>

          </div>
        </div>

      </main>
    </div>
  );
}


