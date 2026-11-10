"""Generate the placeholder sound set procedurally (soft, cozy, pentatonic).

Run from the game folder:  uv run --no-project --with numpy python scripts/assets/build_sounds.py

These are honest placeholders so the game has feedback from day one (Final-Idea file 08):
a person must still judge every sound on a real phone speaker before release.
"""
from __future__ import annotations

import wave
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parents[2] / "assets" / "sfx"
SR = 22050
RNG = np.random.default_rng(7)


def t_axis(seconds: float) -> np.ndarray:
    return np.arange(int(SR * seconds)) / SR


def env(n: int, attack: float, decay: float) -> np.ndarray:
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(t - attack, 0) / decay)


def tone(freq: float, seconds: float, attack=0.004, decay=0.08, harmonics=((1, 1.0), (2, 0.25))) -> np.ndarray:
    t = t_axis(seconds)
    sig = sum(amp * np.sin(2 * np.pi * freq * k * t) for k, amp in harmonics)
    return sig * env(len(t), attack, decay)


def sweep(f0: float, f1: float, seconds: float, attack=0.003, decay=0.06) -> np.ndarray:
    t = t_axis(seconds)
    f = f0 * (f1 / f0) ** (t / seconds)
    phase = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(phase) * env(len(t), attack, decay)


def noise(seconds: float, decay=0.03, lowpass=0.2) -> np.ndarray:
    n = int(SR * seconds)
    x = RNG.standard_normal(n)
    y = np.zeros(n)
    acc = 0.0
    for i in range(n):  # one-pole low-pass for a soft, airy noise
        acc += lowpass * (x[i] - acc)
        y[i] = acc
    return y * env(n, 0.002, decay)


def mix(*parts: tuple[np.ndarray, float]) -> np.ndarray:
    n = max(int(off * SR) + len(sig) for sig, off in parts)
    out = np.zeros(n)
    for sig, off in parts:
        i = int(off * SR)
        out[i:i + len(sig)] += sig
    return out


def save(name: str, sig: np.ndarray, gain: float = 0.6) -> None:
    peak = np.max(np.abs(sig)) or 1.0
    sig = sig / peak * gain
    fade = min(len(sig), int(0.01 * SR))
    sig[-fade:] *= np.linspace(1, 0, fade)
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((sig * 32767).astype(np.int16).tobytes())


def note(semitones_from_c4: float) -> float:
    return 261.63 * 2 ** (semitones_from_c4 / 12)


PENTA = [0, 2, 4, 7, 9]


def penta(i: int) -> float:
    return note(12 * (i // 5) + PENTA[i % 5])


def main() -> None:
    # merge pops: one rising pentatonic ladder, the pitch tells the player how big they went
    for tier in range(1, 17):
        f = penta(tier + 2)
        body = sweep(f * 1.7, f, 0.22, decay=0.07) + 0.35 * tone(f / 2, 0.22, decay=0.06)
        save(f"merge_{tier:02d}", mix((noise(0.03, 0.01, 0.35) * 0.25, 0), (body, 0.004)), 0.55)
    save("drop", sweep(950, 620, 0.07, decay=0.025), 0.25)
    save("impact", mix((tone(150, 0.09, decay=0.03, harmonics=((1, 1), (2, 0.3))), 0), (noise(0.06, 0.02, 0.08) * 0.6, 0)), 0.3)
    save("hug_select", sweep(700, 820, 0.09, decay=0.04), 0.35)
    save("hug_link", tone(980, 0.06, decay=0.02, harmonics=((1, 1), (3, 0.2))), 0.25)
    save("hug_no", tone(190, 0.08, decay=0.03), 0.3)
    bell = ((1, 1.0), (2.76, 0.35), (5.4, 0.12))
    save("hug", mix((tone(note(16), 0.6, decay=0.22, harmonics=bell), 0), (tone(note(23), 0.6, decay=0.25, harmonics=bell) * 0.8, 0.06)), 0.5)
    save("big_hug", mix(*[(tone(note(n), 0.7, decay=0.25, harmonics=bell), i * 0.07) for i, n in enumerate([24, 28, 31, 36])]), 0.5)
    save("hug_tag", mix((tone(note(31), 0.4, decay=0.15, harmonics=bell), 0), (tone(note(36), 0.4, decay=0.18, harmonics=bell), 0.09)), 0.4)
    save("coin", mix((tone(2400, 0.14, decay=0.04, harmonics=((1, 1), (1.5, 0.6))), 0), (tone(3200, 0.1, decay=0.03), 0.035)), 0.3)
    save("gem", mix(*[(tone(f, 0.35, decay=0.12, harmonics=bell), i * 0.04) for i, f in enumerate([1760, 2637, 3520])]), 0.35)
    save("tier_up", mix(*[(tone(note(n), 0.4, decay=0.14, harmonics=bell), i * 0.11) for i, n in enumerate([19, 24, 28, 31])]), 0.5)
    save("legendary", mix(*[(tone(note(n), 1.6, attack=0.25, decay=0.6, harmonics=bell) * 0.6, 0) for n in [12, 16, 19, 24]], (tone(note(31), 1.2, decay=0.5, harmonics=bell), 0.3)), 0.5)
    save("level_complete", mix(*[(tone(note(n), 0.5, decay=0.18, harmonics=bell), i * 0.1) for i, n in enumerate([12, 16, 19, 24, 28])], *[(tone(note(n), 1.2, attack=0.02, decay=0.5, harmonics=bell) * 0.5, 0.5) for n in [12, 19, 24]]), 0.55)
    for i, n in enumerate([28, 31, 36]):
        save(f"star_{i + 1}", tone(note(n), 0.35, decay=0.12, harmonics=bell), 0.4)
    whoosh = noise(0.9, 0.35, 0.05) * np.linspace(0.2, 1, int(0.9 * SR)) ** 2
    save("door", mix((whoosh, 0), *[(tone(note(n), 0.5, decay=0.2, harmonics=bell) * 0.5, 0.45 + i * 0.06) for i, n in enumerate([31, 36, 40])]), 0.45)
    save("card_ready", tone(1568, 0.3, decay=0.1, harmonics=bell), 0.35)
    save("card_use", mix((noise(0.4, 0.15, 0.3) * 0.5, 0), *[(tone(f, 0.4, decay=0.15, harmonics=bell) * 0.6, i * 0.05) for i, f in enumerate([1318, 1760, 2093])]), 0.45)
    warn = tone(220, 0.7, attack=0.3, decay=0.25)
    save("warn", warn, 0.25)
    save("jar_full", sweep(420, 190, 0.7, attack=0.05, decay=0.3), 0.3)
    save("tap", tone(1250, 0.03, decay=0.01), 0.2)
    save("revive", mix(*[(tone(note(n), 0.5, decay=0.2, harmonics=bell), i * 0.08) for i, n in enumerate([19, 23, 26, 31])]), 0.5)
    total = sum(p.stat().st_size for p in OUT.glob("*.wav"))
    print(f"{len(list(OUT.glob('*.wav')))} sounds, {total / 1024:.0f} KB")


if __name__ == "__main__":
    main()
