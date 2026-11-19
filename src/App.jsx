import { useCallback, useEffect, useRef, useState } from "react";
import {
    AudioLines,
    AudioWaveform,
    Check,
    ChevronDown,
    Clock3,
    Disc3,
    Download,
    Library,
    LoaderCircle,
    Music2,
    Pause,
    Play,
    RefreshCw,
    Settings,
    Square,
    Volume2,
    VolumeX,
    WandSparkles,
    X
} from "lucide-react";
import * as Tone from "tone";
import { Midi } from "@tonejs/midi";
import {
    generateComposition,
    getCompositionLibrary,
    deleteComposition,
    getCompositionDownloadUrl
} from "./services/musicApi";
import "./App.css";

const STYLES = [
    ["POP", "Pop"],
    ["ROCK", "Rock"],
    ["CINEMATIC", "Cinematic"],
    ["JAZZ", "Jazz"],
    ["CLASSICAL", "Classical"],
    ["ELECTRONIC", "Electronic"],
    ["HIP_HOP", "Hip Hop"],
    ["AMBIENT", "Ambient"],
    ["ACOUSTIC", "Acoustic"],
    ["R_AND_B", "R&B"],
    ["METAL", "Metal"],
    ["LOFI", "Lo-fi"]
];

const KEYS = ["C", "D", "E", "F", "G", "A", "B"];

const DEFAULT_FORM = {
    title: "My New Composition",
    tonic: "C",
    mode: "MAJOR",
    bpm: 120,
    timeSignatureNumerator: 4,
    timeSignatureDenominator: 4,
    measures: 8,
    contour: "ARCH",
    style: "POP",
    seed: ""
};

const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

function App() {
    const [page, setPage] = useState("composer");
    const [form, setForm] = useState(DEFAULT_FORM);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [composition, setComposition] = useState(null);
    const [library, setLibrary] = useState([]);
    const [isLibraryLoading, setIsLibraryLoading] = useState(false);
    const [deletingFileName, setDeletingFileName] = useState(null);
    const [tracks, setTracks] = useState([]);
    const [duration, setDuration] = useState(0);
    const [position, setPosition] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(80);
    const [selectedTrack, setSelectedTrack] = useState(0);
    const [expandedTracks, setExpandedTracks] = useState(true);

    const partsRef = useRef([]);
    const synthsRef = useRef([]);
    const playingRef = useRef(false);

    const updateForm = (field, value) => {
        setForm((current) => ({
            ...current,
            [field]: value
        }));
    };

    const stopPlayback = useCallback(() => {
        playingRef.current = false;
        setIsPlaying(false);

        Tone.Transport.pause();
        Tone.Transport.seconds = 0;

        partsRef.current.forEach((part) => {
            part.dispose();
        });

        synthsRef.current.forEach((synth) => {
            synth.dispose();
        });

        partsRef.current = [];
        synthsRef.current = [];

        setPosition(0);
    }, []);

    const prepareMidi = useCallback(async (arrayBuffer) => {
        stopPlayback();

        const midi = new Midi(arrayBuffer);
        const midiTracks = midi.tracks.map((track, index) => ({
            id: index,
            name: track.name || track.instrument?.name || `Track ${index + 1}`,
            instrument: track.instrument?.name || "Synthesizer",
            channel: track.channel,
            isDrum: track.channel === 9,
            notes: track.notes.map((note) => ({
                name: note.name,
                midi: note.midi,
                time: note.time,
                duration: note.duration,
                velocity: note.velocity
            }))
        }));

        const midiDuration = Math.max(midi.duration || 0, 1);

        setTracks(midiTracks);
        setDuration(midiDuration);
        setPosition(0);
        setSelectedTrack(0);

        return {
            tracks: midiTracks,
            duration: midiDuration
        };
    }, [stopPlayback]);

    const loadComposition = useCallback(async (result) => {
        const downloadUrl = getCompositionDownloadUrl(result);
        const response = await fetch(downloadUrl);

        if (!response.ok) {
            throw new Error(
                `Could not load the MIDI file (${response.status}).`
            );
        }

        const arrayBuffer = await response.arrayBuffer();
        await prepareMidi(arrayBuffer);

        const loadedComposition = {
            ...result,
            title: result.title || result.fileName || "Untitled Composition"
        };

        setComposition(loadedComposition);

        if (result.tonic) updateForm("tonic", result.tonic);
        if (result.mode) updateForm("mode", result.mode);
        if (result.bpm) updateForm("bpm", result.bpm);
        if (result.style) updateForm("style", result.style);
        if (result.title) updateForm("title", result.title);
        if (result.measures) updateForm("measures", result.measures);
        if (result.contour) updateForm("contour", result.contour);
        if (result.timeSignatureNumerator) {
            updateForm("timeSignatureNumerator", result.timeSignatureNumerator);
        }
        if (result.timeSignatureDenominator) {
            updateForm("timeSignatureDenominator", result.timeSignatureDenominator);
        }
        updateForm("seed", result.seed ?? "");

        return loadedComposition;
    }, [prepareMidi]);

    const refreshLibrary = useCallback(async () => {
        setIsLibraryLoading(true);

        try {
            const savedCompositions = await getCompositionLibrary();
            setLibrary(Array.isArray(savedCompositions) ? savedCompositions : []);
        } catch (libraryError) {
            setError(libraryError.message || "Could not load your music library.");
        } finally {
            setIsLibraryLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshLibrary();
    }, [refreshLibrary]);

    const handleGenerate = async (event) => {
        event.preventDefault();

        setError("");
        setSuccess("");

        if (!form.title.trim()) {
            setError("Please enter a composition title.");
            return;
        }

        const request = {
            title: form.title.trim(),
            tonic: form.tonic,
            mode: form.mode,
            bpm: Number(form.bpm),
            timeSignatureNumerator: Number(form.timeSignatureNumerator),
            timeSignatureDenominator: Number(form.timeSignatureDenominator),
            measures: Number(form.measures),
            contour: form.contour,
            style: form.style
        };

        if (form.seed.trim() !== "") {
            const seedValue = Number(form.seed);

            if (!Number.isSafeInteger(seedValue)) {
                setError("The seed must be a valid whole number.");
                return;
            }

            request.seed = seedValue;
        }

        try {
            setIsGenerating(true);

            const result = await generateComposition(request);

            if (result.success === false) {
                throw new Error(result.message || "Composition generation failed.");
            }

            await loadComposition(result);
            await refreshLibrary();
            setSuccess(result.message || "Your composition was generated successfully and saved to your library.");
        } catch (generationError) {
            setError(generationError.message || "An unexpected error occurred.");
        } finally {
            setIsGenerating(false);
        }
    };

    const createPlayback = useCallback(async () => {
        if (tracks.length === 0) return;

        await Tone.start();

        partsRef.current.forEach((part) => part.dispose());
        synthsRef.current.forEach((synth) => synth.dispose());

        partsRef.current = [];
        synthsRef.current = [];

        Tone.Transport.stop();
        Tone.Transport.cancel();
        Tone.Transport.seconds = position;

        Tone.getDestination().volume.value =
            volume <= 0 ? -Infinity : 20 * Math.log10(volume / 100);

        tracks.forEach((track) => {
            if (track.notes.length === 0) return;

            const synth = new Tone.PolySynth(Tone.Synth, {
                oscillator: {
                    type: track.isDrum ? "triangle" : "sawtooth"
                },
                envelope: {
                    attack: track.isDrum ? 0.001 : 0.02,
                    decay: 0.15,
                    sustain: track.isDrum ? 0 : 0.45,
                    release: track.isDrum ? 0.08 : 0.4
                }
            }).toDestination();

            synthsRef.current.push(synth);

            const events = track.notes.map((note) => ({
                time: note.time,
                name: note.name,
                duration: Math.max(note.duration, 0.05),
                velocity: Math.max(0.05, note.velocity)
            }));

            const part = new Tone.Part((time, event) => {
                synth.triggerAttackRelease(
                    event.name,
                    event.duration,
                    time,
                    event.velocity
                );
            }, events);

            part.start(0);
            partsRef.current.push(part);
        });

        Tone.Transport.start();
        playingRef.current = true;
        setIsPlaying(true);
    }, [tracks, position, volume]);

    const togglePlayback = async () => {
        if (tracks.length === 0) return;

        try {
            if (playingRef.current) {
                Tone.Transport.pause();
                playingRef.current = false;
                setIsPlaying(false);
                return;
            }

            if (position >= duration) {
                setPosition(0);
                await createPlayback();
                return;
            }

            await createPlayback();
        } catch (playbackError) {
            setError(`Playback error: ${playbackError.message}`);
        }
    };

    const handleSeek = async (value) => {
        const nextPosition = Number(value);
        const wasPlaying = playingRef.current;

        if (wasPlaying) {
            Tone.Transport.pause();
            playingRef.current = false;
            setIsPlaying(false);
        }

        setPosition(nextPosition);
        Tone.Transport.seconds = nextPosition;

        if (wasPlaying) {
            await createPlayback();
        }
    };

    const handleDownload = async () => {
        if (!composition) return;

        try {
            const url = getCompositionDownloadUrl(composition);
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Download failed (${response.status}).`);
            }

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = objectUrl;
            link.download = composition.fileName || "musicy-composition.mid";

            document.body.appendChild(link);
            link.click();
            link.remove();

            URL.revokeObjectURL(objectUrl);
        } catch (downloadError) {
            setError(downloadError.message);
        }
    };

    const loadFromLibrary = async (item) => {
        setError("");
        setSuccess("");

        try {
            setIsGenerating(true);
            await loadComposition(item);
            setPage("composer");
            setSuccess(`Loaded "${item.title || item.fileName}" from your library.`);
        } catch (loadError) {
            setError(loadError.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDeleteComposition = async (item) => {
        if (!item?.fileName) return;

        const confirmed = window.confirm(
            `Delete "${item.title || item.fileName}" permanently? This cannot be undone.`
        );

        if (!confirmed) return;

        setError("");
        setSuccess("");
        setDeletingFileName(item.fileName);

        try {
            await deleteComposition(item.fileName);
            setLibrary((current) => current.filter(
                (compositionItem) => compositionItem.fileName !== item.fileName
            ));

            if (composition?.fileName === item.fileName) {
                stopPlayback();
                setComposition(null);
                setTracks([]);
                setDuration(0);
                setPosition(0);
            }

            setSuccess(`Deleted "${item.title || item.fileName}".`);
        } catch (deleteError) {
            setError(deleteError.message || "Could not delete this composition.");
        } finally {
            setDeletingFileName(null);
        }
    };

    const changeVolume = (value) => {
        const nextVolume = Number(value);
        setVolume(nextVolume);

        Tone.getDestination().volume.value =
            nextVolume <= 0 ? -Infinity : 20 * Math.log10(nextVolume / 100);
    };

    useEffect(() => {
        if (!isPlaying) return undefined;

        const interval = window.setInterval(() => {
            const current = Tone.Transport.seconds;
            setPosition(Math.min(current, duration));

            if (current >= duration && duration > 0) {
                Tone.Transport.pause();
                playingRef.current = false;
                setIsPlaying(false);
            }
        }, 100);

        return () => window.clearInterval(interval);
    }, [isPlaying, duration]);

    useEffect(() => {
        return () => {
            partsRef.current.forEach((part) => part.dispose());
            synthsRef.current.forEach((synth) => synth.dispose());
            Tone.Transport.stop();
            Tone.Transport.cancel();
        };
    }, []);

    const totalNotes = tracks.reduce((sum, track) => sum + track.notes.length, 0);

    return (
        <div className="app-shell">
            <header className="topbar">
                <div className="topbar-inner">
                    <div className="brand" onClick={() => setPage("composer")}>
                        <div className="brand-icon">
                            <AudioWaveform size={18} />
                        </div>
                        <div>
                            <h1>Musicy Studio</h1>
                            <span>YURPHA GAMES MUSIC REPOSITORY</span>
                        </div>
                    </div>

                    <nav className="topnav" aria-label="Primary navigation">
                        <button
                            type="button"
                            className={`nav-pill ${page === "composer" ? "active" : ""}`}
                            onClick={() => setPage("composer")}
                        >
                            <Music2 size={15} />
                            Composer
                        </button>

                        <button
                            type="button"
                            className={`nav-pill ${page === "library" ? "active" : ""}`}
                            onClick={() => {
                                setPage("library");
                                refreshLibrary();
                            }}
                        >
                            <Library size={15} />
                            Library
                            {library.length > 0 && (
                                <span className="nav-count">{library.length}</span>
                            )}
                        </button>

                        <button
                            type="button"
                            className={`nav-pill ${page === "settings" ? "active" : ""}`}
                            onClick={() => setPage("settings")}
                        >
                            <Settings size={15} />
                            Settings
                        </button>
                    </nav>

                    <div className="topbar-status">
                        <span className="status-dot"></span>
                        <span>STUDIO READY</span>
                    </div>
                </div>
            </header>

            <main className="page-shell">
                <div className="page-inner">
                    {error && (
                        <div className="notice error-notice">
                            <X size={16} />
                            <span>{error}</span>
                            <button type="button" onClick={() => setError("")} aria-label="Dismiss error">
                                <X size={15} />
                            </button>
                        </div>
                    )}

                    {success && (
                        <div className="notice success-notice">
                            <Check size={16} />
                            <span>{success}</span>
                            <button type="button" onClick={() => setSuccess("")} aria-label="Dismiss message">
                                <X size={15} />
                            </button>
                        </div>
                    )}

                    {page === "composer" && (
                        <div className="repo-layout">
                            <aside className="summary-column">
                                <div className="panel summary-card">
                                    <span className="eyebrow-pill">
                                        <span className="dot-blue"></span>
                                        MUSICY STUDIO ENGINE
                                    </span>

                                    <h2 className="summary-title">Composition &amp; MIDI Studio</h2>
                                    <p className="summary-desc">
                                        Configure parameters on the right to generate MIDI compositions, preview tracks in real time, and export archives.
                                    </p>

                                    <div className="stats-grid">
                                        <div className="stat-box">
                                            <span className="stat-label">SAVED</span>
                                            <strong className="stat-value">{library.length}</strong>
                                        </div>
                                        <div className="stat-box">
                                            <span className="stat-label">TRACKS</span>
                                            <strong className="stat-value stat-accent">{tracks.length}</strong>
                                        </div>
                                        <div className="stat-box">
                                            <span className="stat-label">NOTES</span>
                                            <strong className="stat-value stat-muted">{totalNotes}</strong>
                                        </div>
                                    </div>

                                    <div className="player-divider"></div>

                                    <div className="player-block-header">
                                        <div className="panel-title-group">
                                            <Disc3 size={16} className="icon-blue" />
                                            <div>
                                                <h3>MIDI Preview Player</h3>
                                                <p>{composition ? "Composition ready" : "No composition loaded"}</p>
                                            </div>
                                        </div>
                                        <span className="badge-pill">
                                            {composition ? "READY" : "IDLE"}
                                        </span>
                                    </div>

                                    <div className={`preview-artwork ${composition ? "has-music" : ""}`}>
                                        <AudioWaveform size={44} strokeWidth={1.25} />
                                        <span>{composition ? `${composition.tonic} ${composition.mode} · ${composition.bpm} BPM` : "NO COMPOSITION LOADED"}</span>
                                    </div>

                                    <div className="track-information">
                                        <strong>{composition?.title || "Untitled Composition"}</strong>
                                        <span>
                                            {composition
                                                ? `${composition.style} · ${composition.measures || form.measures} measures`
                                                : "Generate or load a composition to preview"}
                                        </span>
                                    </div>

                                    <div className="player-progress">
                                        <input
                                            className="seek-slider"
                                            type="range"
                                            min="0"
                                            max={Math.max(duration, 1)}
                                            step="0.01"
                                            value={Math.min(position, duration)}
                                            onChange={(event) => handleSeek(event.target.value)}
                                            disabled={!composition}
                                            aria-label="Seek timeline"
                                        />
                                        <div className="progress-times">
                                            <span>{formatTime(position)}</span>
                                            <span>{formatTime(duration)}</span>
                                        </div>
                                    </div>

                                    <div className="player-controls">
                                        <button
                                            type="button"
                                            className="player-button"
                                            onClick={togglePlayback}
                                            disabled={!composition}
                                            aria-label={isPlaying ? "Pause" : "Play"}
                                        >
                                            {isPlaying
                                                ? <Pause size={18} fill="currentColor" />
                                                : <Play size={18} fill="currentColor" />}
                                        </button>

                                        <button
                                            type="button"
                                            className="player-secondary"
                                            onClick={stopPlayback}
                                            disabled={!composition}
                                            aria-label="Stop"
                                        >
                                            <Square size={14} fill="currentColor" />
                                        </button>
                                    </div>

                                    <div className="volume-control">
                                        {volume === 0
                                            ? <VolumeX size={15} />
                                            : <Volume2 size={15} />}
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={volume}
                                            onChange={(event) => changeVolume(event.target.value)}
                                            aria-label="Volume"
                                        />
                                        <span>{volume}%</span>
                                    </div>

                                    <button
                                        type="button"
                                        className="download-button"
                                        onClick={handleDownload}
                                        disabled={!composition}
                                    >
                                        <Download size={15} />
                                        Download MIDI
                                    </button>
                                </div>
                            </aside>

                            <section className="main-column">
                                <div className="page-header-row">
                                    <div>
                                        <h2>Composition Generator</h2>
                                        <p>Configure musical parameters, generate compositions, and inspect instrument lanes.</p>
                                    </div>
                                    <button
                                        type="button"
                                        className="ghost-btn"
                                        onClick={refreshLibrary}
                                        disabled={isLibraryLoading}
                                    >
                                        <RefreshCw size={14} className={isLibraryLoading ? "spin" : ""} />
                                        Sync Library
                                    </button>
                                </div>

                                <div className="panel generator-panel">
                                    <div className="panel-top-bar">
                                        <div className="panel-title-group">
                                            <span className="status-dot"></span>
                                            <strong>Parameters &amp; Arrangement</strong>
                                            <span className="count-chip">AI MIDI</span>
                                        </div>
                                        <span className="panel-meta-note">Tone.js + @tonejs/midi</span>
                                    </div>

                                    <form className="composer-form" onSubmit={handleGenerate}>
                                        <div className="field-group">
                                            <label htmlFor="title">Composition title</label>
                                            <input
                                                id="title"
                                                value={form.title}
                                                maxLength={150}
                                                onChange={(event) => updateForm("title", event.target.value)}
                                                placeholder="Give your music a name"
                                                required
                                            />
                                        </div>

                                        <div className="field-row">
                                            <div className="field-group">
                                                <label htmlFor="tonic">Musical key</label>
                                                <select
                                                    id="tonic"
                                                    value={form.tonic}
                                                    onChange={(event) => updateForm("tonic", event.target.value)}
                                                >
                                                    {KEYS.map((key) => (
                                                        <option key={key} value={key}>{key}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="field-group">
                                                <label htmlFor="mode">Scale mode</label>
                                                <select
                                                    id="mode"
                                                    value={form.mode}
                                                    onChange={(event) => updateForm("mode", event.target.value)}
                                                >
                                                    <option value="MAJOR">Major</option>
                                                    <option value="MINOR">Minor</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="field-row">
                                            <div className="field-group">
                                                <label htmlFor="bpm">
                                                    Tempo <span>{form.bpm} BPM</span>
                                                </label>
                                                <input
                                                    id="bpm"
                                                    type="number"
                                                    min="20"
                                                    max="300"
                                                    value={form.bpm}
                                                    onChange={(event) => updateForm("bpm", event.target.value)}
                                                    required
                                                />
                                            </div>

                                            <div className="field-group">
                                                <label htmlFor="measures">Measures</label>
                                                <input
                                                    id="measures"
                                                    type="number"
                                                    min="1"
                                                    max="128"
                                                    value={form.measures}
                                                    onChange={(event) => updateForm("measures", event.target.value)}
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div className="field-row">
                                            <div className="field-group">
                                                <label>Time signature</label>
                                                <div className="time-signature">
                                                    <select
                                                        aria-label="Time signature numerator"
                                                        value={form.timeSignatureNumerator}
                                                        onChange={(event) => updateForm("timeSignatureNumerator", event.target.value)}
                                                    >
                                                        {[2, 3, 4, 5, 6, 7, 8, 9, 12].map((value) => (
                                                            <option key={value} value={value}>{value}</option>
                                                        ))}
                                                    </select>
                                                    <span>/</span>
                                                    <select
                                                        aria-label="Time signature denominator"
                                                        value={form.timeSignatureDenominator}
                                                        onChange={(event) => updateForm("timeSignatureDenominator", event.target.value)}
                                                    >
                                                        {[2, 4, 8, 16].map((value) => (
                                                            <option key={value} value={value}>{value}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            <div className="field-group">
                                                <label htmlFor="style">Musical style</label>
                                                <select
                                                    id="style"
                                                    value={form.style}
                                                    onChange={(event) => updateForm("style", event.target.value)}
                                                >
                                                    {STYLES.map(([value, label]) => (
                                                        <option key={value} value={value}>{label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="field-row">
                                            <div className="field-group">
                                                <label htmlFor="contour">Melody contour</label>
                                                <select
                                                    id="contour"
                                                    value={form.contour}
                                                    onChange={(event) => updateForm("contour", event.target.value)}
                                                >
                                                    <option value="ARCH">Arch</option>
                                                </select>
                                            </div>

                                            <div className="field-group">
                                                <label htmlFor="seed">Random seed <span>Optional</span></label>
                                                <input
                                                    id="seed"
                                                    type="number"
                                                    value={form.seed}
                                                    onChange={(event) => updateForm("seed", event.target.value)}
                                                    placeholder="Random"
                                                />
                                            </div>
                                        </div>

                                        <button
                                            type="submit"
                                            className="generate-button"
                                            disabled={isGenerating}
                                        >
                                            {isGenerating ? (
                                                <LoaderCircle className="spin" size={16} />
                                            ) : (
                                                <WandSparkles size={16} />
                                            )}
                                            {isGenerating ? "Generating composition..." : "Generate Composition"}
                                        </button>
                                    </form>
                                </div>

                                <div className="panel tracks-panel">
                                    <div className="panel-top-bar">
                                        <div className="panel-title-group">
                                            <AudioLines size={16} className="icon-blue" />
                                            <strong>Track &amp; MIDI Visualizer</strong>
                                            <span className="count-chip">{tracks.length}</span>
                                        </div>

                                        <button
                                            type="button"
                                            className="ghost-btn compact-btn"
                                            onClick={() => setExpandedTracks((value) => !value)}
                                            disabled={!tracks.length}
                                        >
                                            <ChevronDown
                                                size={14}
                                                className={expandedTracks ? "" : "rotated"}
                                            />
                                            {expandedTracks ? "Collapse" : "Expand"}
                                        </button>
                                    </div>

                                    {!tracks.length ? (
                                        <div className="empty-tracks">
                                            <div className="track-grid-decoration">
                                                {Array.from({ length: 24 }).map((_, index) => (
                                                    <div key={index}></div>
                                                ))}
                                            </div>
                                            <p>No MIDI tracks loaded yet. Generate or load a composition to inspect notes.</p>
                                        </div>
                                    ) : expandedTracks && (
                                        <div className="track-editor">
                                            <div className="timeline-ruler">
                                                {Array.from({ length: 9 }).map((_, index) => (
                                                    <span key={index}>{index + 1}</span>
                                                ))}
                                            </div>

                                            {tracks.map((track, index) => (
                                                <div
                                                    className={`track-row ${selectedTrack === index ? "selected" : ""}`}
                                                    key={track.id}
                                                    onClick={() => setSelectedTrack(index)}
                                                >
                                                    <div className="track-label">
                                                        <span className={`track-color track-color-${index % 6}`}></span>
                                                        <div>
                                                            <strong>{track.name}</strong>
                                                            <span>
                                                                {track.isDrum ? "Drums" : track.instrument}
                                                                {" · "}
                                                                {track.notes.length} notes
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="note-lane">
                                                        {track.notes.map((note, noteIndex) => (
                                                            <div
                                                                key={`${track.id}-${noteIndex}`}
                                                                className={`midi-note midi-note-${index % 6}`}
                                                                title={`${note.name} · ${note.duration.toFixed(2)}s`}
                                                                style={{
                                                                    left: `${(note.time / duration) * 100}%`,
                                                                    width: `${Math.max((note.duration / duration) * 100, 0.25)}%`,
                                                                    top: `${Math.max(4, Math.min(88, 88 - ((note.midi - 24) / 72) * 84))}%`
                                                                }}
                                                            />
                                                        ))}
                                                        <div
                                                            className="playhead"
                                                            style={{ left: `${duration ? (position / duration) * 100 : 0}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {tracks.length > 0 && (
                                        <div className="track-footer">
                                            <span>
                                                <Clock3 size={13} />
                                                {formatTime(duration)} total duration
                                            </span>
                                            <span>
                                                Selected: {tracks[selectedTrack]?.name || "None"}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>
                    )}

                    {page === "library" && (
                        <section className="subpage-section">
                            <div className="page-header-row">
                                <div>
                                    <h2>Saved Compositions Library</h2>
                                    <p>Browse compositions stored on your backend, load them into the studio, or download MIDI files.</p>
                                </div>
                                <div className="header-actions">
                                    <span className="count-chip">{library.length} total</span>
                                    <button
                                        type="button"
                                        className="ghost-btn"
                                        onClick={refreshLibrary}
                                        disabled={isLibraryLoading}
                                    >
                                        <RefreshCw size={14} className={isLibraryLoading ? "spin" : ""} />
                                        Refresh
                                    </button>
                                </div>
                            </div>

                            {isLibraryLoading ? (
                                <div className="panel empty-state-card">
                                    <LoaderCircle size={32} className="spin icon-blue" />
                                    <h3>Loading compositions</h3>
                                    <p>Fetching saved compositions from your server...</p>
                                </div>
                            ) : library.length === 0 ? (
                                <div className="panel empty-state-card">
                                    <Library size={36} className="icon-blue" />
                                    <h3>No compositions saved yet</h3>
                                    <p>Generate a composition in the studio and it will show up here automatically.</p>
                                    <button
                                        type="button"
                                        className="generate-button inline-btn"
                                        onClick={() => setPage("composer")}
                                    >
                                        Open Composer
                                    </button>
                                </div>
                            ) : (
                                <div className="library-list">
                                    {library.map((item) => (
                                        <div className="panel archive-item-card" key={item.fileName}>
                                            <div className="archive-item-main">
                                                <div className="archive-icon-box">
                                                    <AudioWaveform size={18} />
                                                </div>
                                                <div className="archive-meta">
                                                    <div className="archive-title-line">
                                                        <strong>{item.title || "Untitled Composition"}</strong>
                                                        <span className="badge-pill">
                                                            {item.tonic} {item.mode}
                                                        </span>
                                                    </div>
                                                    <span className="archive-sub">
                                                        {item.style} · {item.bpm} BPM · {item.timeSignatureNumerator}/{item.timeSignatureDenominator} · {item.measures} measures
                                                    </span>
                                                    {item.createdAt && (
                                                        <span className="archive-date">
                                                            {new Date(item.createdAt).toLocaleString()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="archive-actions">
                                                <button
                                                    type="button"
                                                    className="ghost-btn compact-btn"
                                                    onClick={() => loadFromLibrary(item)}
                                                    disabled={isGenerating || deletingFileName === item.fileName}
                                                >
                                                    <Play size={13} />
                                                    Load
                                                </button>

                                                <button
                                                    type="button"
                                                    className="primary-sm-btn"
                                                    onClick={async () => {
                                                        try {
                                                            const response = await fetch(getCompositionDownloadUrl(item));
                                                            if (!response.ok) throw new Error(`Download failed (${response.status}).`);
                                                            const blob = await response.blob();
                                                            const objectUrl = URL.createObjectURL(blob);
                                                            const link = document.createElement("a");
                                                            link.href = objectUrl;
                                                            link.download = item.fileName;
                                                            document.body.appendChild(link);
                                                            link.click();
                                                            link.remove();
                                                            URL.revokeObjectURL(objectUrl);
                                                        } catch (downloadError) {
                                                            setError(downloadError.message);
                                                        }
                                                    }}
                                                    disabled={deletingFileName === item.fileName}
                                                >
                                                    <Download size={13} />
                                                    Download
                                                </button>

                                                <button
                                                    type="button"
                                                    className="danger-sm-btn"
                                                    onClick={() => handleDeleteComposition(item)}
                                                    disabled={deletingFileName === item.fileName}
                                                    aria-label={`Delete ${item.title || item.fileName}`}
                                                >
                                                    {deletingFileName === item.fileName ? (
                                                        <LoaderCircle size={13} className="spin" />
                                                    ) : (
                                                        <X size={13} />
                                                    )}
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    )}

                    {page === "settings" && (
                        <section className="subpage-section">
                            <div className="page-header-row">
                                <div>
                                    <h2>Studio Settings</h2>
                                    <p>Runtime audio and backend configuration for this workspace.</p>
                                </div>
                            </div>

                            <div className="panel settings-panel">
                                <div className="settings-row">
                                    <div>
                                        <strong>Audio synthesis engine</strong>
                                        <span>Real-time Web Audio playback powered by Tone.js</span>
                                    </div>
                                    <span className="badge-pill">Tone.js</span>
                                </div>
                                <div className="settings-row">
                                    <div>
                                        <strong>Composition service</strong>
                                        <span>Spring Boot generation &amp; library API</span>
                                    </div>
                                    <span className="badge-pill">Spring Boot</span>
                                </div>
                                <div className="settings-row">
                                    <div>
                                        <strong>Track format</strong>
                                        <span>Parsed client-side via @tonejs/midi</span>
                                    </div>
                                    <span className="badge-pill">Standard MIDI</span>
                                </div>
                            </div>
                        </section>
                    )}
                </div>
            </main>

            <footer className="bottombar">
                <div className="bottombar-inner">
                    <span>Musicy Studio — Yurpha Games</span>
                    <span className="footer-muted">MIDI &amp; Tone.js Workspace</span>
                </div>
            </footer>
        </div>
    );
}

export default App;