import json
import os
import datetime
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager # Importato per il 'lifespan'

import uvicorn
import pandas as pd
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# --- Importazioni dal Colab (Ora dovrebbero funzionare) ---
try:
    from hopwise.quick_start import load_data_and_model
    from hopwise.utils.case_study import full_sort_explanations
    from hopwise.data import create_dataset 
except ImportError:
    print("ERRORE CRITICO: La libreria 'hopwise' (o 'pathlim') non è installata.")
    print("Assicurati di aver eseguito 'pip install -e .' nella cartella del modello.")
    exit()

# =============================================================================
# 1. DEFINIZIONE DEI MODELLI (Pydantic)
# (Non modificato)
# =============================================================================

class SharedEntity(BaseModel):
    type: str
    label: str

class Explanation(BaseModel):
    brief: str
    percent: float
    shared_entities: List[SharedEntity]
    path_example: List[List[Any]] 

class RecommendationItem(BaseModel):
    item_id: int
    label: str
    type: str
    score: float
    explanation: Explanation

class RecommendationResponse(BaseModel):
    user_id: int
    generated_at: str
    recommendations: List[RecommendationItem]

# =============================================================================
# 2. STATO GLOBALE E PERCORSI
# =============================================================================

GLOBAL_MODEL_STATE = { "is_loaded": False }

# --- PERCORSI DINAMICI (Corretti per il tuo PC) ---
SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
UI_PROJECT_ROOT = os.path.dirname(SERVER_DIR)
DESKTOP_PATH = os.path.dirname(UI_PROJECT_ROOT)
MODEL_REPO_PATH = os.path.join(DESKTOP_PATH, "kg-model-repository") 
DATASET_PATH = os.path.join(MODEL_REPO_PATH, "data", "dataset", "ml-100k")
# --- !!! CONTROLLA QUESTO NOME DI FILE !!! ---
# Assicurati che il nome del file .pth sia esatto
CHECKPOINT_FILE = os.path.join(MODEL_REPO_PATH, "checkpoint", "PGPR-Jul-08-2025_19-52-14.pth") 
DATASET_NAME = "ml-100k" 
MOCK_FILE_PATH = os.path.join(UI_PROJECT_ROOT, 'public', 'data', 'mock_recs.json')
# ----------------------------------------


# =============================================================================
# 3. LOGICA DI CARICAMENTO DEL MODELLO (CORRETTA)
# =============================================================================

def load_model_from_disk():
    """
    Carica i modelli, i dati e le funzioni di mapping dal disco.
    Eseguita UNA SOLA VOLTA all'avvio del server.
    """
    print("Avvio: Caricamento del modello PGPR e dei dati...")
    print(f"Percorso checkpoint: {CHECKPOINT_FILE}")
    print(f"Percorso dataset: {DATASET_PATH}")
    
    try:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"Utilizzo del dispositivo: {device}")

        # --- ### INIZIO DELLA CORREZIONE ### ---
        # 1. Carica il modello PGPR e i dati SENZA argomenti extra
        #    Questo caricherà la configurazione "sbagliata" (con i percorsi di Google Drive)
        
        config, model, dataset, train_data, valid_data, test_data = load_data_and_model(
            model_file=CHECKPOINT_FILE
            # Rimossi 'config_dict' e 'device' perché non sono argomenti validi
        )
        
        # 2. SOVRASCRIVI manualmente i percorsi sbagliati
        print(f"Percorso dati nel modello: {config['data_path']} (verrà sovrascritto)")
        config['data_path'] = DATASET_PATH
        config['device'] = device
        model.to(device)
        print(f"Nuovo percorso dati impostato: {config['data_path']}")
        # --- ### FINE DELLA CORREZIONE ### ---
        
        
        # 3. Carica i dati degli item (film) usando il percorso CORRETTO
        item_file_path = os.path.join(config['data_path'], f"{DATASET_NAME}.item")
        items_data = pd.read_csv(item_file_path, sep="\t")

        # 4. Definisci le funzioni di mapping (dal Colab)
        def eid2entity(x): return f'entity {dataset.id2token(dataset.entity_field, x)}'
        def uid2user(x): return f'user {dataset.id2token(dataset.uid_field, x)}'
        def rid2relation(x): return 'watched' if dataset.id2token(dataset.relation_field, x) == dataset.ui_relation else dataset.id2token(dataset.relation_field, x)
        def iid2movie_name(x): 
            try:
                item_token = dataset.id2token(dataset.item_field, x)
                return items_data[items_data['item_id:token'] == item_token]['movie_title:token_seq'].iloc[0]
            except Exception:
                return f"Item {x}" 

        e_type2mapping = {
            'user': uid2user, 'entity': eid2entity, 'item': iid2movie_name, 'relation': rid2relation
        }

        # 5. Definisci i template di spiegazione (dal Colab)
        default_template = "{item} is recommend to you because you {relation1} {entity1} also {relation2} by {entity2}"
        relation2template = {
            "film.film.prequel__film.film.prequel": "I recommend you {item} because it is a prequel of a prequel of a film you liked ({ref}).",
            "film.film.sequel__film.film.sequel": "I recommend you {item} because it is a sequel of a sequel of a film you liked ({ref}).",
            "film.film.actor__film.actor.film": "I recommend you {item} because it stars an actor from a film you liked ({ref}).",
            "film.actor.film__film.actor.film": "I recommend you {item} because it features an actor who worked in multiple films you've seen ({ref}).",
            # ... (Tutti gli altri template copiati dal Colab) ...
            "film.film_subject.films__film.film_subject.films": "I recommend you {item} because it shares the same topic/subject with a film you liked ({ref}).",
            "film.film.subjects__film.film.subjects": "I recommend you {item} because it covers similar themes to a film you liked ({ref}).",
            "film.film.rating__film.content_rating.film": "I recommend you {item} because it has the same content rating as a film you liked ({ref}).",
            "film.film.genre__film.film_genre.films_in_this_genre": "I recommend you {item} because it belongs to the same genre as a film you liked ({ref}).",
            "film.film.written_by__film.writer.film": "I recommend you {item} because it was written by the same writer as a film you liked ({ref}).",
            "film.film.directed_by__film.director.film": "I recommend you {item} because it was directed by the same person as a film you liked ({ref}).",
            "film.film.cinematography__film.cinematographer.film": "I recommend you {item} because it was shot by the same cinematographer as a film you liked ({ref}).",
            "film.film.produced_by__film.producer.film": "I recommend you {item} because it was produced by the same producer as a film you liked ({ref}).",
            "film.film.production_companies__film.production_company.films": "I recommend you {item} because it was made by the same production company as a film you liked ({ref})."
        }

        # Salva tutto nello stato globale
        GLOBAL_MODEL_STATE["config"] = config
        GLOBAL_MODEL_STATE["model"] = model
        GLOBAL_MODEL_STATE["dataset"] = dataset
        GLOBAL_MODEL_STATE["test_data"] = test_data
        GLOBAL_MODEL_STATE["items_data"] = items_data
        GLOBAL_MODEL_STATE["e_type2mapping"] = e_type2mapping
        GLOBAL_MODEL_STATE["relation2template"] = relation2template
        GLOBAL_MODEL_STATE["default_template"] = default_template
        GLOBAL_MODEL_STATE["is_loaded"] = True
        
        print("--- ✅ Modello PGPR e dati REALI caricati con successo. ---")
        
    except FileNotFoundError as e:
        print(f"--- ❌ ERRORE CRITICO: File non trovato ---")
        print(f"Percorso cercato: {e.filename}")
        print("Verifica che i PERCORSI (CHECKPOINT_FILE e DATASET_PATH) all'inizio di 'api_server.py' siano corretti.")
        print("Hai eseguito i notebook di addestramento nella cartella 'kg-model-repository'?")
    except Exception as e:
        print(f"--- ❌ ERRORE CRITICO DURANTE IL CARICAMENTO: {e} ---")
        print("Assicurati che 'hopwise' e 'torch' siano installati correttamente.")


# =============================================================================
# 4. LOGICA DI INFERENZA (Vera, non Mock)
# =============================================================================

# (Funzioni helper _generate_brief_explanation e _create_shared_entities)
def _generate_brief_explanation(row, dataset, e_type2mapping, relation2template, default_template):
    path = row["path"]; readable = [];
    for hop in path:
        relation_id, entity_type, entity_id = hop
        if relation_id != "self_loop":
            decode_fn = e_type2mapping.get("relation"); decoded = decode_fn(relation_id) if decode_fn else f"relation{relation_id}"; readable.append(decoded)
        if entity_type == "entity" and dataset.id2token(dataset.entity_field, entity_id) in dataset.entity2item: entity_type = "item"
        decode_fn = e_type2mapping.get(entity_type); decoded = decode_fn(entity_id) if decode_fn else f"{entity_type}{entity_id}"; readable.append(decoded)
    relation_tokens = [dataset.id2token(dataset.relation_field, hop[0]) for hop in path if hop[0] != "self_loop"]
    if all(r == dataset.ui_relation for r in relation_tokens): return default_template.format(item=readable[-1], relation1="watched", entity1=readable[2], relation2="watched", entity2=readable[4])
    key = "__".join([r for r in relation_tokens if r != dataset.ui_relation]); template = relation2template.get(key)
    if template: return template.format(item=readable[-1], ref=readable[2])
    else:
        if "actor" in key: return "Attori in comune";
        if "director" in key: return "Regista correlato";
        if "genre" in key: return "Genere simile";
        return "Affinità di profilo"
def _create_shared_entities(path, dataset, e_type2mapping) -> List[SharedEntity]:
    shared_entities = [];
    for hop in path[1:-1]:
        relation_id, entity_type, entity_id = hop
        if entity_type == "entity":
            relation_name = e_type2mapping["relation"](relation_id); entity_label = e_type2mapping["entity"](entity_id);
            entity_type_label = "unknown"
            if "actor" in relation_name: entity_type_label = "actor"
            elif "director" in relation_name: entity_type_label = "director"
            elif "genre" in relation_name: entity_type_label = "genre"
            entity_label = entity_label.replace("entity ", "");
            shared_entities.append(SharedEntity(type=entity_type_label, label=entity_label))
    return shared_entities


def get_recommendations_from_model(user_id: int, k: int) -> RecommendationResponse:
    if not GLOBAL_MODEL_STATE["is_loaded"]:
        print("ATTENZIONE: Modello non caricato. Utilizzo del mock_recs.json di fallback.")
        return get_recommendations_from_mock(user_id, k) 

    config = GLOBAL_MODEL_STATE["config"]; model = GLOBAL_MODEL_STATE["model"]
    dataset = GLOBAL_MODEL_STATE["dataset"]; test_data = GLOBAL_MODEL_STATE["test_data"]
    e_type2mapping = GLOBAL_MODEL_STATE["e_type2mapping"]
    relation2template = GLOBAL_MODEL_STATE["relation2template"]
    default_template = GLOBAL_MODEL_STATE["default_template"]
    
    try:
        user_token = str(user_id) 
        uid_series = dataset.token2id(dataset.uid_field, [user_token])
    except KeyError:
         print(f"ATTENZIONE: User ID {user_id} (token '{user_token}') non trovato nei dati. Uso il mock.")
         return get_recommendations_from_mock(user_id, k)

    explanations_df = full_sort_explanations(
        uid_series, model, test_data, device=config["device"]
    )
    
    top_k_df = explanations_df.head(k)
    
    recommendations_list = []
    for _, row in top_k_df.iterrows():
        item_id = int(row['item'])
        score = float(row['score'])
        path = row['path']
        
        brief_explanation = _generate_brief_explanation(row, dataset, e_type2mapping, relation2template, default_template)
        shared_entities = _create_shared_entities(path, dataset, e_type2mapping)
        
        item_token = dataset.id2token(dataset.item_field, item_id)
        item_label = e_type2mapping['item'](item_token) 

        rec_item = RecommendationItem(
            item_id=item_id, label=item_label, type="movie", score=score,
            explanation=Explanation(
                brief=brief_explanation,
                percent=round(score * 100, 2),
                shared_entities=shared_entities,
                path_example=path 
            )
        )
        recommendations_list.append(rec_item)

    return RecommendationResponse(
        user_id=user_id,
        generated_at=datetime.datetime.now().isoformat(),
        recommendations=recommendations_list
    )

def get_recommendations_from_mock(user_id: int, k: int) -> RecommendationResponse:
    """ Funzione di fallback che legge il mock JSON se il modello fallisce. """
    try:
        with open(MOCK_FILE_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if data.get("user_id") != user_id:
            raise HTTPException(status_code=404, detail=f"Utente {user_id} non trovato nel mock.")
        all_recs = data.get("recommendations", [])
        sorted_recs = sorted(all_recs, key=lambda r: r['score'], reverse=True)
        top_k_recs = sorted_recs[:k]
        return RecommendationResponse(
            user_id=user_id,
            generated_at=datetime.datetime.now().isoformat(),
            recommendations=top_k_recs
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel fallback mock: {e}")


# =============================================================================
# 5. CREAZIONE E AVVIO DELL'APP FASTAPI
# =============================================================================

# --- CORREZIONE: Uso di 'lifespan' al posto di 'on_event' (deprecato) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Codice da eseguire all'avvio
    print("Esecuzione dello startup event (lifespan)...")
    load_model_from_disk() # Carica il modello VERO
    yield
    print("Esecuzione dello shutdown event...")

app = FastAPI(
    title="KG Recommender API",
    lifespan=lifespan  # Collega il nuovo gestore di avvio/chiusura
)

# Configurazione CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Permetti a http://localhost:5173 di connettersi
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/recommendations/{user_id}", response_model=RecommendationResponse)
async def get_recommendations_endpoint(user_id: int, k: int = 20):
    if not GLOBAL_MODEL_STATE["is_loaded"]:
        print("ATTENZIONE: Modello non caricato. Chiamata in fallback su mock.json.")
        return get_recommendations_from_mock(user_id, k)
        
    print(f"Ricevuta richiesta VERA per user_id: {user_id}, k: {k}")
    try:
        return get_recommendations_from_model(user_id, k)
    except Exception as e:
        print(f"Errore fatale durante l'inferenza: {e}")
        # Se l'inferenza fallisce (es. utente non trovato), usa il mock
        return get_recommendations_from_mock(user_id, k)

if __name__ == "__main__":
    print("Avvio server API FastAPI (Modalità Reale) su http://localhost:8000")
    uvicorn.run("api_server:app", host="0.0.0.0", port=8000, reload=True)