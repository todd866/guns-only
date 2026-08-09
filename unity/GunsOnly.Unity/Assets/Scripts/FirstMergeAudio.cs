using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Minimal first-merge audio: engine rumble loop + gun burst (procedural clips).
/// Prefer silent validation with <c>?audioQa=silent</c> on web; here clamp master gain via env.
/// </summary>
public sealed class FirstMergeAudio : MonoBehaviour {
    AudioSource _engine;
    AudioSource _guns;
    float _master = 1f;
    bool _gunsPlaying;

    public static FirstMergeAudio Attach(Transform parent) {
        var go = new GameObject("FirstMergeAudio");
        go.transform.SetParent(parent, false);
        var audio = go.AddComponent<FirstMergeAudio>();
        audio.Build();
        return audio;
    }

    void Build() {
        string silent = System.Environment.GetEnvironmentVariable("GUNSONLY_AUDIO_SILENT");
        if (silent is "1" or "true" or "TRUE" || QaPilot.Enabled) _master = 0f;

        _engine = gameObject.AddComponent<AudioSource>();
        _engine.clip = MakeNoiseClip("engine", 0.35f, 90f, 0.55f);
        _engine.loop = true;
        _engine.volume = 0.18f * _master;
        _engine.Play();

        _guns = gameObject.AddComponent<AudioSource>();
        _guns.clip = MakeNoiseClip("guns", 0.12f, 2200f, 0.9f);
        _guns.loop = true;
        _guns.volume = 0f;
        _guns.Play();
    }

    public void Tick(bool triggerHeld, float throttle01) {
        if (_engine != null) {
            _engine.volume = (0.12f + 0.16f * Mathf.Clamp01(throttle01)) * _master;
            _engine.pitch = 0.85f + 0.35f * Mathf.Clamp01(throttle01);
        }
        if (_guns == null) return;
        if (triggerHeld) {
            _guns.volume = 0.42f * _master;
            _gunsPlaying = true;
        } else if (_gunsPlaying) {
            _guns.volume = Mathf.MoveTowards(_guns.volume, 0f, Time.deltaTime * 8f);
            if (_guns.volume <= 0.001f) _gunsPlaying = false;
        }
    }

    static AudioClip MakeNoiseClip(string name, float seconds, float toneHz, float noiseMix) {
        int rate = 22050;
        int samples = Mathf.CeilToInt(seconds * rate);
        var data = new float[samples];
        var rng = new System.Random(name.GetHashCode());
        for (int i = 0; i < samples; i++) {
            float t = i / (float)rate;
            float tone = Mathf.Sin(2f * Mathf.PI * toneHz * t);
            float noise = (float)(rng.NextDouble() * 2.0 - 1.0);
            // Soft envelope so loops don't click.
            float env = 1f;
            float edge = 0.01f * rate;
            if (i < edge) env = i / edge;
            if (i > samples - edge) env = (samples - i) / edge;
            data[i] = (tone * (1f - noiseMix) + noise * noiseMix) * 0.35f * env;
        }
        var clip = AudioClip.Create(name, samples, 1, rate, false);
        clip.SetData(data, 0);
        return clip;
    }
}

}
