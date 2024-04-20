import { FC, useEffect } from "react";
import { Renderer } from "./renderer";
import { useCache } from "../lib/cache";

interface Props {
    renderer: Renderer;
}

export const OpacityControls: FC<Props> = ({ renderer }) => {
    const [overlayImageOpacity, setOverlayImageOpacity] = useCache<number>("overlayImageOpacity", renderer.overlayImageOpacity);
    const [referenceImageOpacity, setReferenceImageOpacity] = useCache<number>("referenceImageOpacity", renderer.referenceImageOpacity);

    useEffect(() => {
        renderer.overlayImageOpacity = overlayImageOpacity;
    }, [overlayImageOpacity]);

    useEffect(() => {
        renderer.referenceImageOpacity = referenceImageOpacity;
    }, [referenceImageOpacity]);

    return (
        <>
            <div className="form-group">
                <label>Overlay Image Opacity: {(overlayImageOpacity * 100).toFixed(0)}%</label>
                <input
                    className="form-control"
                    type="range"
                    min="0"
                    max="1"
                    step={0.01}
                    value={overlayImageOpacity}
                    onChange={(e) => setOverlayImageOpacity(parseFloat(e.target.value))}
                />
            </div>
            <div className="form-group">
                <label>Reference Image Opacity: {(referenceImageOpacity * 100).toFixed(0)}%</label>
                <input
                    className="form-control"
                    type="range"
                    min="0"
                    max="1"
                    step={0.01}
                    value={referenceImageOpacity}
                    onChange={(e) => setReferenceImageOpacity(parseFloat(e.target.value))}
                />
            </div>
        </>
    );
};
