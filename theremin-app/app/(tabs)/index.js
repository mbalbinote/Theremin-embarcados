import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, Text, View, SafeAreaView, TextInput, TouchableOpacity, Keyboard, ScrollView, StatusBar } from 'react-native';
import Slider from '@react-native-community/slider';
import { io } from 'socket.io-client';
import { WebView } from 'react-native-webview';

// ==============================================
// ⚠️ COLOQUE SEU IP AQUI
// ==============================================
const SOCKET_URL = 'http://192.168.1.3:3000'; 

export default function App() {
  const [freq, setFreq] = useState(0);
  const [vibrato, setVibrato] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [connected, setConnected] = useState(false);
  
  const [maxFreqConfig, setMaxFreqConfig] = useState('800');
  const [maxVibConfig, setMaxVibConfig] = useState('100');
  
  const webViewRef = useRef(null);
  const socketRef = useRef(null); 

  useEffect(() => {
    const socket = io(SOCKET_URL);
    socketRef.current = socket; 

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('sensorData', (data) => {
      const parts = data.split(',');
      if(parts.length < 2) return;
      const f = parseFloat(parts[0]);
      const v = parseFloat(parts[1]);

      setFreq(Math.round(f));
      setVibrato(Math.round(v));

      if (webViewRef.current) {
        const msg = JSON.stringify({ type: 'update', freq: f, vibrato: v });
        webViewRef.current.postMessage(msg);
      }
    });

    return () => socket.disconnect();
  }, []);

  const handleVolumeChange = (val) => {
    setVolume(val);
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({ type: 'volume', value: val }));
    }
  };

  const sendConfig = () => {
    if (socketRef.current && maxFreqConfig && maxVibConfig) {
        const payload = `${maxFreqConfig},${maxVibConfig}`;
        socketRef.current.emit('configurarArduino', payload);
        Keyboard.dismiss(); 
        // Feedback sutil (opcional: vibration ou toast)
    }
  };

  // --- MOTOR DE ÁUDIO (INTERFACE MINIMALISTA) ---
  const audioEngineHTML = `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          body { 
            margin:0; background: #121212; color: #00ff99; 
            font-family: 'Helvetica Neue', sans-serif; 
            overflow: hidden; display: flex; flex-direction: column; 
            align-items: center; justify-content: center; height: 100vh; 
            user-select: none; -webkit-touch-callout: none; 
          }
          
          /* Botão Simples e Elegante */
          .btn-simple {
            background: transparent;
            border: 1px solid #444;
            color: #888;
            padding: 10px 25px;
            font-size: 11px;
            letter-spacing: 1px;
            text-transform: uppercase;
            cursor: pointer;
            transition: all 0.3s ease;
            border-radius: 4px;
          }
          
          .btn-simple:active {
            background: #00ff99;
            color: #000;
            border-color: #00ff99;
          }

          /* Visualizador (Anel Fino) */
          .ring {
            width: 40px; height: 40px;
            border: 2px solid #00ff99;
            border-radius: 50%;
            opacity: 0;
            transform: scale(1);
            transition: transform 0.05s;
          }
          
          .status-text {
            margin-top: 15px; font-size: 9px; color: #444; letter-spacing: 2px;
          }
        </style>
      </head>
      <body>
        
        <div id="start-container">
            <div class="btn-simple" ontouchstart="initAudio()" onclick="initAudio()">
                INICIAR SISTEMA DE SOM
            </div>
        </div>

        <div id="vis" class="ring"></div>
        <div id="lbl" class="status-text" style="display:none">AUDIO ENGINE ACTIVE</div>

        <script>
          let audioCtx, masterGain, osc, oscFifth, oscOctave, isInit = false;
          let targetFreq = 0, targetVibrato = 0, vibratoRate = 6.0, globalVolume = 0.5;
          
          function initAudio() {
            if (isInit) { if(audioCtx.state === 'suspended') audioCtx.resume(); return; }
            try {
              const AudioContext = window.AudioContext || window.webkitAudioContext; audioCtx = new AudioContext();
              masterGain = audioCtx.createGain(); masterGain.gain.value = 0.5; masterGain.connect(audioCtx.destination);
              osc = createOsc('sine'); oscFifth = createOsc('sine'); oscOctave = createOsc('sine');
              isInit = true; 
              
              document.getElementById('start-container').style.display = 'none';
              document.getElementById('lbl').style.display = 'block';
              
              requestAnimationFrame(soundLoop);
            } catch(e) {}
          }

          function createOsc(type) {
            const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
            o.type = type; o.connect(g); g.connect(masterGain); g.gain.value = 0; o.start(); return { osc: o, gain: g };
          }
          
          let startTime = Date.now();
          function soundLoop() {
            if (!audioCtx) return;
            if (audioCtx.state === 'suspended') audioCtx.resume();
            
            let time = (Date.now() - startTime) / 1000;
            let lfo = Math.sin(time * Math.PI * 2 * vibratoRate);
            let finalFreq = targetFreq + (lfo * (targetVibrato * 0.5));
            const vis = document.getElementById('vis');

            if (targetFreq > 50) {
               osc.osc.frequency.setTargetAtTime(finalFreq, audioCtx.currentTime, 0.05);
               oscFifth.osc.frequency.setTargetAtTime(finalFreq * 1.5, audioCtx.currentTime, 0.05);
               oscOctave.osc.frequency.setTargetAtTime(finalFreq * 2.0, audioCtx.currentTime, 0.05);

               osc.gain.gain.setTargetAtTime(0.4 * globalVolume, audioCtx.currentTime, 0.1);
               oscFifth.gain.gain.setTargetAtTime(0.1 * globalVolume, audioCtx.currentTime, 0.1);
               oscOctave.gain.gain.setTargetAtTime(0.2 * globalVolume, audioCtx.currentTime, 0.1);
               
               vis.style.opacity = 1;
               vis.style.transform = "scale(" + (1 + targetVibrato/50) + ")";
            } else {
               osc.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
               oscFifth.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
               oscOctave.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
               vis.style.opacity = 0.1; vis.style.transform = "scale(1)";
            }
            requestAnimationFrame(soundLoop);
          }

          function handleMessage(event) {
            try { const data = JSON.parse(event.data);
               if (data.type === 'update') { targetFreq = Number(data.freq); targetVibrato = Number(data.vibrato); }
               if (data.type === 'volume') { globalVolume = Number(data.value); }
            } catch(e) {}
          }
          window.addEventListener('message', handleMessage); document.addEventListener('message', handleMessage);
        </script>
      </body>
    </html>
  `;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <View style={styles.header}>
           <Text style={styles.title}>THEREMIN</Text>
           <View style={styles.connectionBadge}>
              <View style={[styles.dot, {backgroundColor: connected ? '#00ff99' : '#333'}]} />
              <Text style={styles.connectionText}>
                {connected ? "CONECTADO" : "OFFLINE"}
              </Text>
           </View>
        </View>

        {/* CONFIG CARD */}
        <View style={styles.card}>
           <Text style={styles.sectionTitle}>CONFIGURAÇÃO</Text>
           
           <View style={styles.row}>
              <View>
                <Text style={styles.label}>FREQ MÁX</Text>
                <TextInput 
                    style={styles.input} 
                    value={maxFreqConfig} 
                    onChangeText={setMaxFreqConfig}
                    keyboardType="numeric"
                />
              </View>

              <View>
                <Text style={styles.label}>VIBRAÇÃO MÁX</Text>
                <TextInput 
                    style={styles.input} 
                    value={maxVibConfig} 
                    onChangeText={setMaxVibConfig}
                    keyboardType="numeric"
                />
              </View>

              <TouchableOpacity style={styles.btn} onPress={sendConfig}>
                  <Text style={styles.btnText}>ENVIAR</Text>
              </TouchableOpacity>
           </View>
        </View>

        {/* MAIN DISPLAY */}
        <View style={styles.displayContainer}>
            <Text style={styles.freqMain}>{freq}</Text>
            <Text style={styles.unitMain}>HZ</Text>
            
            <View style={styles.divider} />
            
            <View style={styles.row}>
                <Text style={styles.subLabel}>VIBRATO LEVEL</Text>
                <Text style={styles.subValue}>{vibrato}</Text>
            </View>
        </View>

        {/* VOLUME SLIDER */}
        <View style={styles.sliderContainer}>
          <Text style={styles.label}>VOLUME MASTER</Text>
          <Slider
            style={{width: '100%', height: 40}}
            minimumValue={0} maximumValue={1.5} value={volume}
            onValueChange={handleVolumeChange}
            minimumTrackTintColor="#00ff99" 
            maximumTrackTintColor="#333" 
            thumbTintColor="#fff"
          />
        </View>

        {/* MOTOR DE AUDIO (VISUAL) */}
        <View style={styles.engineWrapper}>
           <WebView
            ref={webViewRef} originWhitelist={['*']} source={{ html: audioEngineHTML }}
            javaScriptEnabled={true} mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback={true} scrollEnabled={false}
            style={{backgroundColor: 'transparent'}}
          />
        </View>
        
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  scrollContent: { padding: 20, alignItems: 'center' },
  
  header: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30, marginTop: 10 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#fff', letterSpacing: 4 },
  connectionBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  connectionText: { color: '#666', fontSize: 10, fontWeight: 'bold' },

  card: { width: '100%', backgroundColor: '#1a1a1a', borderRadius: 8, padding: 15, marginBottom: 20 },
  sectionTitle: { color: '#00ff99', fontSize: 10, fontWeight: 'bold', marginBottom: 15, letterSpacing: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: '#555', fontSize: 10, marginBottom: 5, fontWeight: 'bold' },
  input: { backgroundColor: '#222', color: '#fff', width: 80, padding: 8, borderRadius: 4, fontSize: 14, textAlign: 'center' },
  btn: { backgroundColor: '#333', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 4, borderWidth: 1, borderColor: '#444' },
  btnText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  displayContainer: { width: '100%', alignItems: 'center', marginBottom: 30 },
  freqMain: { fontSize: 80, fontWeight: '200', color: '#fff', letterSpacing: -2 },
  unitMain: { fontSize: 14, color: '#00ff99', marginTop: -10, letterSpacing: 2 },
  divider: { width: 40, height: 2, backgroundColor: '#222', marginVertical: 15 },
  subLabel: { color: '#555', fontSize: 10, marginRight: 10 },
  subValue: { color: '#fff', fontSize: 14, fontWeight: 'bold' },

  sliderContainer: { width: '100%', marginBottom: 30 },

  engineWrapper: { 
    width: '100%', height: 100, 
    backgroundColor: '#000', 
    borderRadius: 8, 
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#222'
  }
});