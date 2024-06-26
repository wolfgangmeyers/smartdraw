import React, { FC, useEffect, useState } from "react";
import { Renderer } from "./renderer";
import { BaseTool, Tool } from "./tool";
import { PaletteButton } from "./PaletteButton";
import { ColorPicker } from "./ColorPicker";
import { OpacityControls } from "./OpacityControls";
import { useCache } from "../lib/cache";
import TimelapseRecorder from "./TimelapseRecorder";

export const defaultColors = [
    "#FFFFFF",
    "#5A2C02",
    "#386EB6",
    "#6B31A1",
    "#CB2C26",
    "#000000",
    "#888888",
    "#50B050",
    "#FBDB37",
    "#E88D2D",
];

export class PencilTool extends BaseTool implements Tool {
    private brushSize = 10;

    private panning = false;
    private isDrawing = false;
    private lastX = 0;
    private lastY = 0;
    private colorPicking = false;
    private lastPickedColor = "#000000";
    private _dirty = false;
    private useReferenceColors = false;

    set dirty(dirty: boolean) {
        this._dirty = dirty;
        if (this.dirtyListener) {
            this.dirtyListener(dirty);
        }
    }

    get dirty() {
        return this._dirty;
    }

    private dirtyListener?: (dirty: boolean) => void;
    private colorPickedListener?: (color: string) => void;

    constructor(
        renderer: Renderer,
        private brushColor = defaultColors[0],
        name = "pencil"
    ) {
        super(renderer, name);
    }

    private sync(brushSize?: number) {
        if (this.colorPicking) {
            this.renderer.setCursor({
                x: this.lastX,
                y: this.lastY,
                radius: this.renderer.getWidth() / 20,
                color: this.lastPickedColor,
                type: "colorpicker",
            });
        } else {
            this.renderer.setCursor({
                x: this.lastX,
                y: this.lastY,
                radius: (brushSize || this.brushSize) / 2,
                color: this.brushColor,
                type: "circle-fill",
            });
        }
    }

    updateArgs(args: any) {
        super.updateArgs(args);
        this.brushSize = args.brushSize || 10;
        this.brushColor = args.brushColor || defaultColors[0];
        this.useReferenceColors = args.useReferenceColors || false;
        this.sync();
    }

    onMouseDown(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        
    }

    onMouseMove(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>): void {
        
    }

    onPointerDown(event: React.PointerEvent<HTMLCanvasElement>): void {
        if (this.colorPicking) {
            return;
        }
        let brushSize = this.brushSize;
        brushSize = event.pressure * this.brushSize * 2;
        
        if (event.button === 0) {
            let { x, y } = this.zoomHelper.translateMouseToCanvasCoordinates(
                event.nativeEvent.offsetX,
                event.nativeEvent.offsetY
            );
            if (this.useReferenceColors) {
                this.brushColor = this.renderer.getReferenceImageColor(x, y);
            }
            this.renderer.drawPoint(
                x,
                y,
                brushSize,
                this.brushColor,
            );
            this.isDrawing = true;
            this.lastX = x;
            this.lastY = y;
            this.dirty = true;
        } else if (event.button === 1) {
            this.panning = true;
        }
        this.sync(brushSize);
    }

    onPointerMove(event: React.PointerEvent<HTMLCanvasElement>): void {
        let brushSize = this.brushSize;
        brushSize = event.pressure * this.brushSize * 2;
        let { x, y } = this.zoomHelper.translateMouseToCanvasCoordinates(
            event.nativeEvent.offsetX,
            event.nativeEvent.offsetY
        );
        if (this.colorPicking) {
            this.lastPickedColor = this.renderer.getPixel(x, y);
        } else if (this.panning) {
            this.zoomHelper.onPan(event);
        } else {
            if (this.isDrawing) {
                this.renderer.drawLine(
                    this.lastX,
                    this.lastY,
                    x,
                    y,
                    brushSize,
                    this.brushColor,
                );
                this.dirty = true;
            }
        }
        this.lastX = x;
        this.lastY = y;
        this.sync(brushSize);
    }

    onPointerUp(event: React.PointerEvent<HTMLCanvasElement>): void {
        if (event.button === 0) {
            this.isDrawing = false;
            if (this.colorPicking) {
                this.colorPicking = false;
                this.brushColor = this.lastPickedColor;
                if (this.colorPickedListener) {
                    this.colorPickedListener(this.lastPickedColor);
                }
            }
            this.renderer.commitSelection();
        } else if (event.button === 1) {
            this.panning = false;
        }
        this.sync();
        
    }

    onMouseUp(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>): void {
        
    }

    onWheel(event: WheelEvent) {
        this.zoomHelper.onWheel(event);
        this.sync();
    }

    cancel() {
        // kind of a hack, clears the selection layer
        this.renderer.setEditImage(null);
        this.dirty = false;
    }

    confirm() {
        this.renderer.commitSelection();
        const encodedImage = this.renderer.getEncodedImage(null, "png");
        if (encodedImage && this.saveListener) {
            this.saveListener(encodedImage, "png");
        }
        this.dirty = false;
    }

    onSaveImage(listener: (encodedImage: string) => void): void {
        this.saveListener = listener;
    }

    onDirty(listener: (dirty: boolean) => void): void {
        this.dirtyListener = listener;
    }

    destroy(): boolean {
        if (this.dirty) {
            this.renderer.commitSelection();
        }
        return true;
    }

    beginColorpicker(): void {
        this.colorPicking = true;
        this.sync();
    }

    onColorPicked(listener: (color: string) => void): void {
        this.colorPickedListener = listener;
    }
}

interface ControlsProps {
    renderer: Renderer;
    tool: PencilTool;
    colors: string[];
}

const MAX_PALETTE_SIZE = 30;

function addToPalette(palette: string[], color: string): string[] {
    if (palette.indexOf(color) === -1) {
        // insert at the beginning
        palette = [color, ...palette];
    }
    if (palette.length > MAX_PALETTE_SIZE) {
        palette = palette.slice(0, MAX_PALETTE_SIZE);
    }
    return palette;
}

export const Controls: FC<ControlsProps> = ({ renderer, tool, colors }) => {
    const [brushSize, setBrushSize] = useState(10);
    const [brushColor, setBrushColor] = useCache("brushColor", "magic");
    const [palette, setPalette] = useState(colors);
    const [useReferenceColors, setUseReferenceColors] = useCache("useReferenceColors", true);
    // const [dirty, setDirty] = useState(false);

    const [maxBrushSize, setMaxBrushSize] = useCache("maxBrushSize", renderer.getWidth() / 10);

    // tool.onDirty(setDirty);

    useEffect(() => {
        tool.updateArgs({
            brushSize,
            brushColor,
            palette,
            useReferenceColors,
        });
    }, [brushSize, brushColor, palette, useReferenceColors]);

    const onColorSelected = (color: string) => {
        setBrushColor(color);
        setPalette(addToPalette(palette, color));
        setUseReferenceColors(false);
    };

    tool.onColorPicked(onColorSelected);

    useEffect(() => {
        setTimeout(() => {
            setMaxBrushSize(renderer.getWidth() / 10);
        }, 1000);
    }, [renderer]);

    return (
        <div style={{ marginTop: "16px" }}>
            <div className="form-group">
                <label style={{ width: "100%" }}>
                    Brush size
                    <small
                        className="form-text text-muted"
                        style={{ float: "right" }}
                    >
                        {brushSize}px
                    </small>
                </label>
                <input
                    type="range"
                    className="form-control-range"
                    min="1"
                    max={maxBrushSize}
                    value={brushSize}
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                />
            </div>
            <div
                style={{
                    display: "flex",
                    flexDirection: "row",
                    flexWrap: "wrap",
                }}
            >
                {palette.map((color, i) => (
                    <PaletteButton
                        key={i}
                        selectedColor={brushColor}
                        color={color}
                        onClick={(color) => {
                            setBrushColor(color);
                            setUseReferenceColors(false);
                        }}
                        onColorSelected={(color) => onColorSelected(color)}
                    />
                ))}
                <button
                    className={`palette-button ${useReferenceColors ? "selected" : ""}`}
                    onClick={() => {
                        setBrushColor("magic");
                        setUseReferenceColors(true);
                    }}
                    >
                    <i className="fas fa-magic" />
                </button>
                <button
                    className="color-picker"
                    onClick={() => tool.beginColorpicker()}
                >
                    <i className="fas fa-eye-dropper" />
                </button>
                <ColorPicker
                    color={brushColor}
                    onColorSelected={(color) => onColorSelected(color)}
                />
            </div>
            {/* <div
                className="form-group"
                style={{
                    marginTop: "16px",
                    visibility: dirty ? "visible" : "hidden",
                }}
            >
                <button
                    className="btn btn-secondary"
                    onClick={() => tool.cancel()}
                >
                    Revert
                </button>
                <button
                    className="btn btn-primary"
                    onClick={() => tool.confirm()}
                    style={{ marginLeft: "8px" }}
                >
                    Save
                </button>
            </div> */}
            <OpacityControls renderer={renderer} />
            <TimelapseRecorder renderer={renderer} />
        </div>
    );
};
