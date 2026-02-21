import cv2
import sys
import json
import os
from pathlib import Path

# usage: python python_stitch.py <output_path> <input_path_1> <input_path_2> ...
# outputs JSON to stdout: { "b_success": true/false, "s_path_output": "...", "s_error": "..." }

def f_stitch(s_path_output, a_s_path_input):
    a_o_img = []
    for s_path in a_s_path_input:
        o_img = cv2.imread(s_path)
        if o_img is None:
            return {"b_success": False, "s_path_output": s_path_output, "s_error": f"failed to read image: {s_path}"}
        a_o_img.append(o_img)

    if len(a_o_img) < 2:
        return {"b_success": False, "s_path_output": s_path_output, "s_error": "need at least 2 images to stitch"}

    # Pre-check for detectable features to avoid OpenCV FLANN assertion failures
    o_orb = cv2.ORB_create(nfeatures=1500)
    a_o_img_filtered = []
    a_s_path_filtered = []
    a_s_path_skipped = []
    for n_idx, o_img in enumerate(a_o_img):
        o_gray = cv2.cvtColor(o_img, cv2.COLOR_BGR2GRAY)
        a_kp, a_desc = o_orb.detectAndCompute(o_gray, None)
        if a_desc is None or len(a_kp) < 10:
            a_s_path_skipped.append(a_s_path_input[n_idx])
            continue
        a_o_img_filtered.append(o_img)
        a_s_path_filtered.append(a_s_path_input[n_idx])

    if len(a_o_img_filtered) < 2:
        return {
            "b_success": False,
            "s_path_output": s_path_output,
            "s_error": "need at least 2 images with enough features to stitch",
            "a_s_path_skipped": a_s_path_skipped
        }

    o_stitcher = cv2.Stitcher.create(cv2.Stitcher_SCANS)
    try:
        n_status, o_result = o_stitcher.stitch(a_o_img_filtered)
    except cv2.error as o_err:
        s_err = str(o_err)
        if "runKnnSearch_" in s_err or "knn <= index_->size()" in s_err:
            return {"b_success": False, "s_path_output": s_path_output, "s_error": "not enough features detected"}
        return {"b_success": False, "s_path_output": s_path_output, "s_error": s_err}

    if n_status != cv2.STITCHER_OK:
        a_s_status_message = {
            1: "not enough features detected",
            2: "homography estimation failed",
            3: "camera parameters adjustment failed",
        }
        s_error = a_s_status_message.get(n_status, f"unknown error code {n_status}")
        return {"b_success": False, "s_path_output": s_path_output, "s_error": s_error}

    cv2.imwrite(s_path_output, o_result)
    # write a smaller version aswell
    # strongest lossless PNG compression
    cv2.imwrite(
        s_path_output.replace(".jpg", "_compressed.png").replace(".jpeg", "_compressed.png"),
        o_result,
        [
            cv2.IMWRITE_PNG_COMPRESSION, 9,   # 0–9 (9 = smallest, slower)
            cv2.IMWRITE_PNG_STRATEGY, cv2.IMWRITE_PNG_STRATEGY_FILTERED,
            cv2.IMWRITE_PNG_BILEVEL, 0
        ]
    )
    # or use sudo apt install pngquant
    # pngquant --quality=65-90 --ext .png --force image.png

    n_scl_y, n_scl_x = o_result.shape[:2]
    return {"b_success": True, "s_path_output": s_path_output, "s_error": "", "n_scl_x": n_scl_x, "n_scl_y": n_scl_y}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "b_success": False,
            "s_path_output": "",
            "s_error": "usage: python stich_image_in_folder.py <output_path> [input_folder]"
        }))
        sys.exit(1)

    s_path_output = sys.argv[1]

    # use input folder from arg or fall back to script directory
    if len(sys.argv) >= 3:
        o_input_dir = Path(sys.argv[2]).resolve()
    else:
        o_input_dir = Path(__file__).resolve().parent

    a_extensions = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"}

    a_s_path_input = sorted([
        str(p) for p in o_input_dir.iterdir()
        if p.suffix.lower() in a_extensions
    ])

    o_result = f_stitch(s_path_output, a_s_path_input)
    print(json.dumps(o_result))
    sys.exit(0 if o_result["b_success"] else 1)