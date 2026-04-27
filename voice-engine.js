// useVoiceEngine - Custom React Hook for Web Speech API
// Copy this entire block and paste it BEFORE the App component in your HTML

const useVoiceEngine = ({
  enabled,
  distance,
  water,
  waypointIndex,
  routeIndex,
  routes,
  selectedRouteId,
  sessionObstacles,
  sessionWaterAlerts,
  sessionMinutes,
  obstacleThreshold,
  activePage,
  voiceRate = 0.92
}) => {
  const [isSpeaking, setIsSpeaking] = React.useState(false);

  // Refs for mutable state to avoid stale closures
  const queueRef = React.useRef([]);
  const prevDistanceRef = React.useRef(null);
  const prevWaterRef = React.useRef(0);
  const prevWaypointRef = React.useRef(waypointIndex);
  const prevRouteRef = React.useRef(routeIndex);
  const prevSelectedRouteRef = React.useRef(selectedRouteId);
  
  const obstacleCooldownRef = React.useRef(0);
  const waterCooldownRef = React.useRef(0);
  const allClearCooldownRef = React.useRef(0);

  // Get the best voice
  const getVoice = React.useCallback(() => {
    const voices = window.speechSynthesis.getVoices();
    const enUsVoice = voices.find(v => v.lang.startsWith('en-US'));
    return enUsVoice || voices[0];
  }, []);

  // Core speech function with priority queue
  const speak = React.useCallback((text, priority = 'medium', shouldInterrupt = false) => {
    if (!enabled || !text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = voiceRate;
    utterance.pitch = 1.05;
    utterance.volume = 1;
    const voice = getVoice();
    if (voice) utterance.voice = voice;

    if (shouldInterrupt && isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      queueRef.current = [];
    }

    if (isSpeaking && !shouldInterrupt) {
      queueRef.current.push({ text, priority });
      queueRef.current.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
      return;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      if (queueRef.current.length > 0) {
        const next = queueRef.current.shift();
        setTimeout(() => speak(next.text, next.priority, false), 200);
      }
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      if (queueRef.current.length > 0) {
        const next = queueRef.current.shift();
        setTimeout(() => speak(next.text, next.priority, false), 200);
      }
    };

    window.speechSynthesis.speak(utterance);
  }, [enabled, getVoice, isSpeaking, voiceRate]);

  // Obstacle detection logic
  React.useEffect(() => {
    if (!enabled || distance === null) return;

    const now = Date.now();
    const isObstacle = distance < obstacleThreshold;
    const wasObstacle = prevDistanceRef.current !== null && prevDistanceRef.current < obstacleThreshold;

    if (isObstacle && !wasObstacle && now - obstacleCooldownRef.current > 4000) {
      if (distance < 30) {
        speak(`Danger. Object very close at ${Math.round(distance)} centimeters.`, 'high', true);
      } else {
        speak(`Warning. Obstacle ahead at ${Math.round(distance)} centimeters. Please stop.`, 'high', true);
      }
      obstacleCooldownRef.current = now;
    }

    if (!isObstacle && wasObstacle && now - allClearCooldownRef.current > 2000) {
      speak("Path is clear.", 'medium', false);
      allClearCooldownRef.current = now;
    }

    prevDistanceRef.current = distance;
  }, [distance, obstacleThreshold, enabled, speak]);

  // Water detection logic
  React.useEffect(() => {
    if (!enabled) return;

    const now = Date.now();
    const isWater = water === 1;
    const wasWater = prevWaterRef.current === 1;

    if (isWater && !wasWater && now - waterCooldownRef.current > 5000) {
      speak("Caution. Water detected on the path. Proceed carefully.", 'high', true);
      waterCooldownRef.current = now;
    }

    prevWaterRef.current = water;
  }, [water, enabled, speak]);

  // Waypoint detection logic
  React.useEffect(() => {
    if (!enabled || waypointIndex === undefined) return;

    if (waypointIndex > prevWaypointRef.current) {
      const route = routes[routeIndex];
      if (route && route.waypoints && route.waypoints[waypointIndex]) {
        const wp = route.waypoints[waypointIndex];
        const instruction = wp.instruction || "Waypoint reached";
        speak(`Waypoint reached. ${instruction}`, 'medium', false);
      }
    }

    prevWaypointRef.current = waypointIndex;
  }, [waypointIndex, routeIndex, routes, enabled, speak]);

  // Route started detection
  React.useEffect(() => {
    if (!enabled || !selectedRouteId) return;

    if (selectedRouteId !== prevSelectedRouteRef.current) {
      const route = routes.find(r => r.id === selectedRouteId);
      if (route) {
        const text = `Starting ${route.name}. Total distance ${route.totalDistance}. Estimated time ${route.estimatedTime}. ${route.safetySummary}`;
        speak(text, 'low', false);
      }
    }

    prevSelectedRouteRef.current = selectedRouteId;
  }, [selectedRouteId, routes, enabled, speak]);

  // Manual functions
  const speakSessionSummary = React.useCallback(() => {
    if (!enabled) return;
    const route = routes.find(r => r.id === selectedRouteId);
    const routeName = route ? route.name : "Unknown route";
    const text = `Session complete. You travelled on ${routeName}. ${sessionObstacles} obstacles were detected. ${sessionWaterAlerts} water hazards were found. Journey took ${Math.round(sessionMinutes)} minutes. Stay safe.`;
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.88;
    utterance.pitch = 1;
    utterance.volume = 1;
    const voice = getVoice();
    if (voice) utterance.voice = voice;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    
    window.speechSynthesis.speak(utterance);
  }, [enabled, routes, selectedRouteId, sessionObstacles, sessionWaterAlerts, sessionMinutes, getVoice]);

  const speakDashboardDescription = React.useCallback((pageName) => {
    if (!enabled) return;

    let text = "";
    switch (pageName) {
      case "live":
        text = `Live Monitor page. Last obstacle distance ${Math.round(distance || 0)} centimeters. ${sessionObstacles} obstacles detected this session. ${sessionWaterAlerts} water alerts. Session running for ${Math.round(sessionMinutes)} minutes.`;
        break;
      case "route":
        const route = routes.find(r => r.id === selectedRouteId);
        const routeName = route ? route.name : "No route";
        const wp = route && route.waypoints ? route.waypoints[waypointIndex] : null;
        const wpLabel = wp ? wp.label : "Unknown";
        const instruction = wp ? wp.instruction : "No instruction";
        text = `Route Navigator page. Currently on ${routeName}. At waypoint ${wpLabel}. Next instruction: ${instruction}`;
        break;
      case "history":
        text = `Session History page. Total readings recorded. ${sessionObstacles} obstacles. ${sessionWaterAlerts} water alerts.`;
        break;
      case "settings":
        text = `Settings page. Obstacle threshold set to ${obstacleThreshold} centimeters. Voice announcements are ${enabled ? 'enabled' : 'disabled'}.`;
        break;
      default:
        text = "Dashboard page.";
    }

    speak(text, 'low', true);
  }, [enabled, distance, sessionObstacles, sessionWaterAlerts, sessionMinutes, routes, selectedRouteId, waypointIndex, obstacleThreshold, speak]);

  const cancelSpeech = React.useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    queueRef.current = [];
  }, []);

  React.useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  return {
    speakSessionSummary,
    speakDashboardDescription,
    isSpeaking,
    cancelSpeech
  };
};
