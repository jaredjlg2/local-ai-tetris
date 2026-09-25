# Third-party components

The game uses the following separately licensed dependencies. Model weights and installed dependency directories are downloaded by setup scripts and are not included in this repository.

| Component | Source | License |
| --- | --- | --- |
| Laya weights | https://huggingface.co/convaiinnovations/laya | Apache-2.0 |
| Laya ONNX bundle | https://huggingface.co/receptron/laya-onnx | See upstream model card and source model license |
| Laya Node runtime | https://github.com/receptron/laya | MIT |
| Von SDK and weights | https://github.com/wfzyx/von and https://huggingface.co/wfzyx/von | Apache-2.0 |
| ONNX Runtime | https://github.com/microsoft/onnxruntime | MIT |
| PyTorch | https://github.com/pytorch/pytorch | BSD-3-Clause |
| Transformers | https://github.com/huggingface/transformers | Apache-2.0 |
| OpenVINO | https://github.com/openvinotoolkit/openvino | Apache-2.0 |
| Playwright (browser tests) | https://github.com/microsoft/playwright | Apache-2.0 |

Exact Node versions are in `package-lock.json`; Python versions are in `von-requirements.lock.txt`. Upstream packages retain their own license notices and transitive dependencies. The download scripts retrieve the model files from their publishers. Von's model card is downloaded alongside its weights.
