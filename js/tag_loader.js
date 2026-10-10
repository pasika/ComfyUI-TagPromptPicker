import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "ComfyUI.TagPromptPicker",
    async nodeCreated(node) {
        if (node.comfyClass === "TagPromptPicker") {
            const dirWidget = node.widgets.find(w => w.name === "prompt_dir");
            const contentWidget = node.widgets.find(w => w.name === "file_content");
            const delimiterWidget = node.widgets.find(w => w.name === "delimiter");
            const saveFilenameWidget = node.widgets.find(w => w.name === "save_filename");

            if (contentWidget) {
                // 监听 delimiter 的值改变，自动同步保存到后端配置文件中
                if (delimiterWidget) {
                    const originalCallback = delimiterWidget.callback;
                    delimiterWidget.callback = function() {
                        if (originalCallback) originalCallback.apply(this, arguments);
                        
                        const dirVal = dirWidget ? dirWidget.value : "";
                        api.fetchApi("/tag_prompt_picker/save_content", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ filename: "_config_sync_", content: "", dir: dirVal })
                        }).catch(() => {});
                    };
                }

                // 1. 创建底部的文件列表流式按钮容器
                const container = document.createElement("div");
                container.style.display = "flex";
                container.style.flexWrap = "wrap";
                container.style.gap = "6px";
                container.style.padding = "4px";
                container.style.maxHeight = "180px";
                container.style.overflowY = "auto";
                container.style.width = "100%";

                // 载入/刷新文件列表函数
                const loadTagButtons = () => {
                    container.innerHTML = "";
                    const currentDir = dirWidget ? dirWidget.value : "";

                    api.fetchApi(`/tag_prompt_picker/list_files?dir=${encodeURIComponent(currentDir)}`)
                        .then(res => res.json())
                        .then(data => {
                            const files = data.files || [];
                            if (files.length === 0) {
                                container.innerText = "No .txt files found in this directory (该目录下暂无 .txt 文件)";
                                container.style.color = "#888";
                                container.style.fontSize = "11px";
                                return;
                            }

                            files.forEach(filename => {
                                const btn = document.createElement("button");
                                btn.innerText = filename;
                                btn.style.padding = "3px 10px";
                                btn.style.border = "1px solid rgba(255, 255, 255, 0.2)";
                                btn.style.borderRadius = "4px";
                                btn.style.background = "rgba(60, 60, 60, 0.8)";
                                btn.style.color = "#fff";
                                btn.style.cursor = "pointer";
                                btn.style.fontSize = "11px";
                                btn.style.whiteSpace = "nowrap";

                                btn.onmouseover = () => { btn.style.background = "rgba(90, 90, 90, 0.9)"; };
                                btn.onmouseout = () => { btn.style.background = "rgba(60, 60, 60, 0.8)"; };

                                // 点击按钮：智能去重拼接
                                btn.onclick = (e) => {
                                    e.preventDefault();
                                    const dirVal = dirWidget ? dirWidget.value : "";
                                    api.fetchApi(`/tag_prompt_picker/get_content?filename=${encodeURIComponent(filename)}&dir=${encodeURIComponent(dirVal)}`)
                                        .then(res => res.json())
                                        .then(resData => {
                                            const newText = (resData.content || "").trim();
                                            if (!newText) return;

                                            const currentText = (contentWidget.value || "").trim();
                                            const delimiter = delimiterWidget ? delimiterWidget.value : ", ";

                                            if (currentText === "") {
                                                contentWidget.value = newText;
                                            } else {
                                                let trimmedCurrent = currentText;
                                                if (delimiter && trimmedCurrent.endsWith(delimiter)) {
                                                    trimmedCurrent = trimmedCurrent.slice(0, trimmedCurrent.length - delimiter.length).trimEnd();
                                                }

                                                let trimmedNew = newText;
                                                if (delimiter && trimmedNew.startsWith(delimiter)) {
                                                    trimmedNew = trimmedNew.slice(delimiter.length).trimStart();
                                                }

                                                contentWidget.value = trimmedCurrent + delimiter + trimmedNew;
                                            }
                                            node.setDirtyCanvas(true, true);
                                        })
                                        .catch(err => {
                                            console.error("Failed to read prompt file (读取提示词文件失败):", err);
                                        });
                                };

                                container.appendChild(btn);
                            });
                        })
                        .catch(err => {
                            console.error("Failed to fetch file list (获取文件列表失败):", err);
                        });
                };

                // 2. 创建常规辅助按钮
                const refreshBtn = node.addWidget("button", "🔄 Refresh File List (刷新文件列表)", null, () => {
                    loadTagButtons();
                });

                // 为了实现“整理”和“清空”在同一行各占 50%，我们通过一个 DOM 容器包裹两个 ComfyUI 原生按钮或自定义 HTML 按钮
                // 这里我们在 ComfyUI 原生 widget 体系中采用自定义 DOM 容器来完美控制 50% 并排布局
                const actionContainer = document.createElement("div");
                actionContainer.style.display = "flex";
                actionContainer.style.gap = "4px";
                actionContainer.style.width = "100%";
                actionContainer.style.boxSizing = "border-box";
                actionContainer.style.padding = "2px 0";

                // “整理”按钮 (Organize)
                const organizeBtn = document.createElement("button");
                organizeBtn.innerText = "🧹 Organize (整理)";
                organizeBtn.style.flex = "1";
                organizeBtn.style.padding = "4px 0";
                organizeBtn.style.border = "1px solid rgba(255, 255, 255, 0.2)";
                organizeBtn.style.borderRadius = "4px";
                organizeBtn.style.background = "rgba(60, 60, 60, 0.8)";
                organizeBtn.style.color = "#fff";
                organizeBtn.style.cursor = "pointer";
                organizeBtn.style.fontSize = "11px";

                organizeBtn.onmouseover = () => { organizeBtn.style.background = "rgba(90, 90, 90, 0.9)"; };
                organizeBtn.onmouseout = () => { organizeBtn.style.background = "rgba(60, 60, 60, 0.8)"; };

                organizeBtn.onclick = (e) => {
                    e.preventDefault();
                    const text = contentWidget.value || "";
                    const delimiter = delimiterWidget ? delimiterWidget.value : ", ";
                    if (!text.trim() || !delimiter) return;

                    // 1. 按 delimiter 拆分文本并去除首尾空白
                    let items = text.split(delimiter).map(item => item.trim()).filter(item => item !== "");

                    // 2. 数组去重（保留第一次出现顺序）
                    const seen = new Set();
                    const uniqueItems = [];
                    for (const item of items) {
                        if (!seen.has(item)) {
                            seen.add(item);
                            uniqueItems.push(item);
                        }
                    }

                    // 3. 重新用 delimiter 拼接
                    contentWidget.value = uniqueItems.join(delimiter);
                    node.setDirtyCanvas(true, true);
                };

                // “清空”按钮 (Clear)
                const clearBtn = document.createElement("button");
                clearBtn.innerText = "🗑️ Clear (清空)";
                clearBtn.style.flex = "1";
                clearBtn.style.padding = "4px 0";
                clearBtn.style.border = "1px solid rgba(255, 255, 255, 0.2)";
                clearBtn.style.borderRadius = "4px";
                clearBtn.style.background = "rgba(60, 60, 60, 0.8)";
                clearBtn.style.color = "#fff";
                clearBtn.style.cursor = "pointer";
                clearBtn.style.fontSize = "11px";

                clearBtn.onmouseover = () => { clearBtn.style.background = "rgba(90, 90, 90, 0.9)"; };
                clearBtn.onmouseout = () => { clearBtn.style.background = "rgba(60, 60, 60, 0.8)"; };

                clearBtn.onclick = (e) => {
                    e.preventDefault();
                    contentWidget.value = "";
                    node.setDirtyCanvas(true, true);
                };

                actionContainer.appendChild(organizeBtn);
                actionContainer.appendChild(clearBtn);

                // 将并排按钮容器注册为 DOM Widget
                const actionDomWidget = node.addDOMWidget("action_buttons", "actions", actionContainer);

                // 保存按钮
                const saveBtn = node.addWidget("button", "💾 Save Prompt File (保存提示词文件)", null, () => {
                    const filename = saveFilenameWidget ? saveFilenameWidget.value.trim() : "";
                    const content = contentWidget ? contentWidget.value : "";
                    const dirVal = dirWidget ? dirWidget.value : "";

                    if (!filename) {
                        alert("Please enter a file name! (请输入要保存的文件名！)");
                        return;
                    }

                    api.fetchApi(`/tag_prompt_picker/check_file?filename=${encodeURIComponent(filename)}&dir=${encodeURIComponent(dirVal)}`)
                        .then(res => res.json())
                        .then(checkData => {
                            if (checkData.exists) {
                                const overwrite = window.confirm(`File "${filename}.txt" already exists. Overwrite? (文件 "${filename}.txt" 已存在，是否确认覆盖？)`);
                                if (!overwrite) {
                                    return;
                                }
                            }

                            api.fetchApi("/tag_prompt_picker/save_content", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ filename, content, dir: dirVal })
                            })
                            .then(res => res.json())
                            .then(data => {
                                if (data.success) {
                                    loadTagButtons();
                                } else {
                                    console.error("Save failed (保存失败):", data.error);
                                }
                            })
                            .catch(err => {
                                console.error("Save request failed (保存文件请求失败):", err);
                            });
                        })
                        .catch(err => {
                            console.error("Check file failed (检查文件失败):", err);
                        });
                });

                // 3. 调整控件排列顺序：
                const dirIndex = node.widgets.findIndex(w => w.name === "prompt_dir");
                const refreshIdx = node.widgets.indexOf(refreshBtn);
                if (refreshIdx !== -1 && dirIndex !== -1) {
                    node.widgets.splice(refreshIdx, 1);
                    node.widgets.splice(dirIndex + 1, 0, refreshBtn);
                }

                // 将并排按钮组（actionDomWidget）调整到 delimiter 后面
                const delimiterIndex = node.widgets.findIndex(w => w.name === "delimiter");
                const actionIdx = node.widgets.indexOf(actionDomWidget);
                if (actionIdx !== -1 && delimiterIndex !== -1) {
                    node.widgets.splice(actionIdx, 1);
                    node.widgets.splice(delimiterIndex + 1, 0, actionDomWidget);
                }

                const saveFilenameIndex = node.widgets.findIndex(w => w.name === "save_filename");
                const saveIdx = node.widgets.indexOf(saveBtn);
                if (saveIdx !== -1 && saveFilenameIndex !== -1) {
                    node.widgets.splice(saveIdx, 1);
                    node.widgets.splice(saveFilenameIndex + 1, 0, saveBtn);
                }

                // 4. 在最底部嵌入文件列表按钮容器
                node.addDOMWidget("tag_buttons_container", "btn_container", container);

                // 初始化加载
                loadTagButtons();
            }
        }
    }
});