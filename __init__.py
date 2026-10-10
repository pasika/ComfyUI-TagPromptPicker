import os
import json
import folder_paths
from server import PromptServer
from aiohttp import web

routes = PromptServer.instance.routes

PLUGIN_DIR = os.path.dirname(os.path.realpath(__file__))
DEFAULT_PROMPT_TAGS_DIR = os.path.join(PLUGIN_DIR, "prompt_tags")
CONFIG_FILE = os.path.join(PLUGIN_DIR, "config.json")

def load_config():
    if not os.path.exists(DEFAULT_PROMPT_TAGS_DIR):
        os.makedirs(DEFAULT_PROMPT_TAGS_DIR, exist_ok=True)
        
    default_config = {
        "prompt_dir": DEFAULT_PROMPT_TAGS_DIR,
        "delimiter": ", "
    }
    
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
                # 兼容合并老配置
                if "prompt_dir" in config and config["prompt_dir"]:
                    default_config["prompt_dir"] = config["prompt_dir"]
                if "delimiter" in config:
                    default_config["delimiter"] = config["delimiter"]
        except Exception as e:
            print(f"[TagPromptPicker] 读取配置文件失败: {e}")
            
    return default_config

def save_config(prompt_dir, delimiter=None):
    try:
        config = load_config()
        if prompt_dir is not None:
            config["prompt_dir"] = prompt_dir
        if delimiter is not None:
            config["delimiter"] = delimiter
            
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=4)
    except Exception as e:
        print(f"[TagPromptPicker] 保存配置文件失败: {e}")

@routes.get("/tag_prompt_picker/list_files")
async def list_tag_files(request):
    target_dir = request.query.get("dir", "").strip()
    config = load_config()
    if not target_dir:
        prompt_dir = config["prompt_dir"]
    else:
        prompt_dir = target_dir
        save_config(prompt_dir=prompt_dir)

    if not os.path.exists(prompt_dir):
        os.makedirs(prompt_dir, exist_ok=True)
        
    files = [f[:-4] for f in os.listdir(prompt_dir) if f.endswith('.txt')]
    return web.json_response({"files": files})

@routes.get("/tag_prompt_picker/get_content")
async def get_tag_content(request):
    filename = request.query.get("filename", "")
    target_dir = request.query.get("dir", "").strip()
    config = load_config()
    
    if not target_dir:
        prompt_dir = config["prompt_dir"]
    else:
        prompt_dir = target_dir
        
    file_path = os.path.join(prompt_dir, filename + ".txt")
    
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read().strip()
        return web.json_response({"content": content})
    return web.json_response({"content": ""})

@routes.get("/tag_prompt_picker/check_file")
async def check_file_exists(request):
    filename = request.query.get("filename", "").strip()
    target_dir = request.query.get("dir", "").strip()
    config = load_config()
    
    if not filename:
        return web.json_response({"exists": False})
        
    if not target_dir:
        prompt_dir = config["prompt_dir"]
    else:
        prompt_dir = target_dir
        
    if not filename.endswith(".txt"):
        filename += ".txt"
        
    file_path = os.path.join(prompt_dir, filename)
    exists = os.path.exists(file_path)
    return web.json_response({"exists": exists})

@routes.post("/tag_prompt_picker/save_content")
async def save_tag_content(request):
    try:
        data = await request.json()
        filename = data.get("filename", "").strip()
        content = data.get("content", "")
        target_dir = data.get("dir", "").strip()
        
        if not filename:
            return web.json_response({"success": False, "error": "文件名不能为空"})
            
        config = load_config()
        if not target_dir:
            prompt_dir = config["prompt_dir"]
        else:
            prompt_dir = target_dir
            
        if not os.path.exists(prompt_dir):
            os.makedirs(prompt_dir, exist_ok=True)
            
        if not filename.endswith(".txt"):
            filename += ".txt"
            
        file_path = os.path.join(prompt_dir, filename)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
            
        return web.json_response({"success": True})
    except Exception as e:
        print(f"[TagPromptPicker] 保存文件失败: {e}")
        return web.json_response({"success": False, "error": str(e)})

class TagPromptPicker:
    @classmethod
    def INPUT_TYPES(s):
        config = load_config()
        current_dir = config["prompt_dir"]
        current_delimiter = config["delimiter"]
        
        return {
            "required": {
                "prompt_dir": ("STRING", {"default": current_dir}),
                "file_content": ("STRING", {"default": "", "multiline": True}),
                "delimiter": ("STRING", {"default": current_delimiter}),
                "save_filename": ("STRING", {"default": "my_new_tag"}),
            }
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "pass_through"
    CATEGORY = "utils/text"

    def pass_through(self, prompt_dir, file_content, delimiter, save_filename):
        # 节点每次执行或参数更新时同步保存配置
        save_config(prompt_dir=prompt_dir, delimiter=delimiter)
        return (file_content,)

NODE_CLASS_MAPPINGS = {
    "TagPromptPicker": TagPromptPicker
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "TagPromptPicker": "Tag Prompt Picker (动态按钮版)"
}

WEB_DIRECTORY = "js"
