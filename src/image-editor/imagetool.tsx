import React, { FC, useEffect, useState } from "react";
import loadImage from "blueimp-load-image";
import saveAs from "file-saver";

import { Renderer } from "./renderer";
import { BaseTool } from "./tool";
import { Dropdown } from "react-bootstrap";
import { useCache } from "../lib/cache";
import { OpacityControls } from "./OpacityControls";

interface Props {
    renderer: Renderer;
    tool: BaseTool;
}

export const ImportExportControls: FC<Props> = ({ renderer, tool }) => {
    const onImageSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            loadImage(
                files[0],
                (img) => {
                    renderer.setBaseImage(img as HTMLImageElement);
                    if (tool.saveListener) {
                        const encodedImage = renderer.getEncodedImage(null, "png");
                        if (encodedImage) {
                            tool.saveListener(encodedImage, "png");
                        }
                    }
                },
                { canvas: false }
            );
        }
    };

    const onReferenceImageSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            loadImage(
                files[0],
                (img) => {
                    renderer.setReferenceImage(img as HTMLImageElement);
                },
                { canvas: false }
            );
        }
    }

    const onOverlayImageSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            loadImage(
                files[0],
                (img) => {
                    renderer.setOverlayImage(img as HTMLImageElement);
                },
                { canvas: false }
            );
        }
    }

    const onExport = (format: "png" | "webp" | "jpeg") => {
        const encodedImage = renderer.getEncodedImage(null, format, true);
        if (encodedImage) {
            // base64 decode
            const byteString = atob(encodedImage);
            // save as file
            const buffer = new ArrayBuffer(byteString.length);
            const intArray = new Uint8Array(buffer);
            for (let i = 0; i < byteString.length; i++) {
                intArray[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([intArray], { type: `image/${format}` });
            let newFilename = window.prompt("Save Image As:", "image." + format);
            if (!newFilename) {
                return;
            }
            saveAs(blob, newFilename);
        }
    };

    // Show buttons for import and export and "save a copy"
    return (
        <>
            <div className="form-group" style={{ marginTop: "16px" }}>
                <label
                    id="loadimage-wrapper"
                    className={`btn btn-primary `}
                    style={{ display: "inline" }}
                >
                    {/* upload image */}
                    <i className="fas fa-upload"></i>&nbsp; Import Image
                    <input
                        id="loadimage"
                        type="file"
                        style={{ display: "none" }}
                        onChange={onImageSelected}
                    />
                </label>
            </div>
            <div className="form-group">
                <label
                    id="loadreference-wrapper"
                    className={`btn btn-primary `}
                    style={{ display: "inline" }}
                >
                    {/* upload reference image */}
                    <i className="fas fa-upload"></i>&nbsp; Import Reference Image
                    <input
                        id="loadreference"
                        type="file"
                        style={{ display: "none" }}
                        onChange={onReferenceImageSelected}
                    />
                </label>
            </div>
            <div className="form-group">
                <label
                    id="loadoverlay-wrapper"
                    className={`btn btn-primary `}
                    style={{ display: "inline" }}
                >
                    {/* upload overlay image */}
                    <i className="fas fa-upload"></i>&nbsp; Import Overlay Image
                    <input
                        id="loadoverlay"
                        type="file"
                        style={{ display: "none" }}
                        onChange={onOverlayImageSelected}
                    />
                </label>
            </div>
            <div className="form-group">
                <Dropdown>
                    <Dropdown.Toggle variant="primary" id="dropdown-basic">
                        <i className="fas fa-download"></i>&nbsp; Export Image
                    </Dropdown.Toggle>
                    <Dropdown.Menu>
                        <Dropdown.Item onClick={() => onExport("png")}>PNG</Dropdown.Item>
                        <Dropdown.Item onClick={() => onExport("webp")}>WEBP</Dropdown.Item>
                        <Dropdown.Item onClick={() => onExport("jpeg")}>JPEG</Dropdown.Item>
                    </Dropdown.Menu>
                </Dropdown>
            </div>
            <OpacityControls renderer={renderer} />
        </>
    );
};
