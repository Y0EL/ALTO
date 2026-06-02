# Lottie Animations (Optional)

Folder ini buat menampung file Lottie JSON. App akan otomatis load file dari sini kalau ada — kalau tidak ada, fallback ke animasi SVG/Framer Motion yang udah dibikin (juga keren).

## File yang dipakai

Aplikasi mencari 3 file ini:

- `upload-wave.json` — saat audio sedang di-upload (animasi soundwave)
- `transcribing.json` — saat Gemini sedang transkrip (animasi mic + dots)
- `success.json` — saat transkrip selesai (checkmark animasi)

## Cara nambahin Lottie real

1. Buka [LottieFiles](https://lottiefiles.com/free-animations/sound-wave) atau [IconScout](https://iconscout.com/lottie-animations/audio-transcription)
2. Search animasi yang lo suka:
   - "audio waveform" / "voice equalizer" → untuk upload-wave
   - "voice typing" / "speech to text" / "transcribing" → untuk transcribing
   - "success check" minimalist → untuk success
3. Download sebagai **Lottie JSON** (free, commercial OK untuk lottiefiles)
4. Rename ke salah satu dari 3 nama di atas
5. Drop ke folder ini
6. Reload app — animasi otomatis dipakai

Catatan: animasi akan respect `prefers-reduced-motion` user di browser, jadi otomatis fallback ke static icon kalau user enable reduced motion.
