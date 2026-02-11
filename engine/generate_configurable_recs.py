import torch
import pandas as pd
import json
import os
from datetime import datetime
from hopwise.quick_start import load_data_and_model
from hopwise.utils.case_study import full_sort_explanations

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

CHECKPOINT_PATH = os.path.join(BASE_DIR, "models", "PGPR-Dec-17-2025_15-09-18.pth")
DATASET_PATH = os.path.join(BASE_DIR, "custom_data")
CONFIG_FILE = os.path.join(BASE_DIR, "config", "domain_config.json")
OUTPUT_PATH = os.path.join(BASE_DIR, "..", "public", "data", "mock_recs.json")
ITEM_FILE_NAME = "custom_data.item"

TARGET_USER_ID = 2 
DESIRED_TOP_K = 50

def load_config(config_path):
    if not os.path.exists(config_path):
        print(f" ERRORE: Config '{config_path}' non trovata!")
        exit()
    with open(config_path, 'r') as f:
        return json.load(f)

def get_mapping_for_relation(relation_name, domain_config):
    mappings = domain_config.get("mappings", {})
    rel_str = str(relation_name)
    if rel_str in mappings: return mappings[rel_str]
    for key, val in mappings.items():
        if key in rel_str: return val
    return domain_config.get("default_mapping", {"type": "entity", "brief_template": "Correlato: {val}"})

def normalize_scores_float(df):
    min_s, max_s = df['score'].min(), df['score'].max()
    if max_s == min_s: return [0.95] * len(df)
    normalized = ((df['score'] - min_s) / (max_s - min_s)) * 0.39 + 0.60
    return normalized.round(3).tolist()

def clean_shared_entities(shared_entities_list):
    clean_list = []
    for entity in shared_entities_list:
        clean_list.append({
            "type": entity["type"],
            "label": entity["label"],
            "role": entity["role"] 
        })
    return clean_list

print(f"Caricamento configurazione da {CONFIG_FILE}...")
domain_config = load_config(CONFIG_FILE)

print(f"Caricamento modello...")
config, model, dataset, train_data, valid_data, test_data = load_data_and_model(model_file=CHECKPOINT_PATH)

config['topk'] = [DESIRED_TOP_K]
if hasattr(model, 'topk'): model.topk = [DESIRED_TOP_K]

item_token_to_title = {}
try:
    item_df = pd.read_csv(os.path.join(DATASET_PATH, ITEM_FILE_NAME), sep='\t')
    iid_field = config['ITEM_ID_FIELD']
    id_col = next((c for c in item_df.columns if c.startswith(iid_field)), None)
    title_col = next((c for c in item_df.columns if ('title' in c.lower() or 'name' in c.lower()) and c != id_col), None)
    if id_col and title_col:
        item_token_to_title = dict(zip(item_df[id_col].astype(str), item_df[title_col]))
except Exception as e:
    print(f"Warning titoli: {e}")

def parse_path_dynamic(path_tuple, target_internal_id):
    path_objects = []
    shared_entities = []
    ui_relation = dataset.ui_relation
    
    for hop in path_tuple:
        rel_id, ent_type, ent_id = hop
        
        if rel_id == "self_loop":
            rel_name = "self_loop"
        else:
            rel_name = dataset.id2token(dataset.relation_field, rel_id)
            if str(rel_name) == str(ui_relation): rel_name = "INTERACTION"

        role = "unknown"
        ent_category = "entity"
        ent_label = str(ent_id)

        if ent_type == "user":
            ent_label = "User"
            ent_category = "user"
            role = "source_entity"
        else:
            token = dataset.id2token(dataset.entity_field, ent_id)
            
            if token in dataset.entity2item:
                ent_category = domain_config.get("item_type_label", "item")
                ent_label = item_token_to_title.get(token, f"Item {token}")
            
                if int(ent_id) == int(target_internal_id):
                    role = "target_item"  
                else:
                    role = "history_item" 
            else:
                
                mapping = get_mapping_for_relation(rel_name, domain_config)
                ent_category = mapping["type"]
                ent_label = token
                role = "context_entity" 
                
                if rel_id != "self_loop":
                    shared_entities.append({
                        "type": ent_category,
                        "label": ent_label,
                        "role": role,
                        "_template": mapping["brief_template"]
                    })

        node_obj = {
            "relation": str(rel_name),
            "type": ent_category,     
            "label": str(ent_label),  
            "role": role              
        }
        path_objects.append(node_obj)
        
    return path_objects, shared_entities

def generate_brief_dynamic(shared_entities):
    if not shared_entities: return "Consigliato per te"
    entity = shared_entities[0]
    template = entity.get("_template", "Correlato a {val}")
    return template.format(val=entity['label'])

def generate_strategy_label(shared_entities, path_objects):
    
    
    if shared_entities:
        primary_type = shared_entities[0]['type']
        
        return f"Basato su {primary_type.capitalize()}"

    users_in_path = [node for node in path_objects if node['type'] == 'user']
    if len(users_in_path) >= 2:
        return "Utenti Simili"

    return "Raccomandazione Generale"


print(f"Generazione per User {TARGET_USER_ID}...")
uid_series = torch.tensor([TARGET_USER_ID]).to(config['device'])
explanations_df = full_sort_explanations(uid_series, model, test_data, device=config['device'])

top_recs = explanations_df.head(DESIRED_TOP_K).copy()
top_recs['norm_score'] = normalize_scores_float(top_recs)

final_json = {
    "user_id": TARGET_USER_ID,
    "domain": domain_config.get("item_type_label", "item"),
    "recommendations": []
}

for idx, row in top_recs.iterrows():
    iid = int(row['item'])
    item_token = dataset.id2token(dataset.iid_field, iid)
    item_label = item_token_to_title.get(item_token, f"Item {item_token}")
    
    path_ex, shared_raw = parse_path_dynamic(row['path'], iid)
    
    strategy_label = generate_strategy_label(shared_raw, path_ex)
    
    rec_obj = {
        "item_id": iid,
        "label": item_label,
        "type": domain_config.get("item_type_label", "item"),
        "role": "target_item", 
        "score": float(row['norm_score']),
        "explanation": {
            "brief": generate_brief_dynamic(shared_raw),
            "strategy_label": strategy_label, 
            "shared_entities": clean_shared_entities(shared_raw),
            "path_example": path_ex 
        }
    }
    final_json["recommendations"].append(rec_obj)

with open(OUTPUT_PATH, "w") as f:
    json.dump(final_json, f, indent=2)

print("\nJSON Generato")
