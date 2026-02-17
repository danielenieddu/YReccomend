# 🎯 YReccomend: Explainable AI Recommendation System

## Indice

1. [👥 Autori](#1-autori)
2. [📖 Introduzione e Scopo del Progetto](#2-introduzione-e-scopo-del-progetto) 
3. [🏗️ Architettura del Sistema](#3-architettura-del-sistema)
4. [✨ Funzionalità Principali](#4-funzionalità-principali)
5. [📂 Struttura della Repository](#5-struttura-della-repository)
6. [🛠️ Prerequisiti e Installazione](#6-prerequisiti-e-installazione)
7. [🧠 Configurazione del Dataset e Modello](#7-configurazione-del-dataset-e-modello)
8. [🚀 Guida all'Avvio](#8-guida-allavvio-quick-start)
9. [🐳 Guida all'Avvio con Docker](#9-guida-docker)
10. [🎨 Interfaccia Utente e Controlli](#10-interfaccia-utente-e-controlli)
11. [📄 Licenza e Contatti](#11-licenza)

---
## 1. 👥 Autori <a name="1-autori"></a>

Progetto sviluppato da:

* **Alessandro Bullegas**
* **Daniele Nieddu**

---

## 2. 📖 Introduzione e Scopo del Progetto <a name="2-introduzione-e-scopo-del-progetto"></a>

I sistemi di raccomandazione moderni sono spesso delle "Black Box": suggeriscono contenuti accurati, ma falliscono nello spiegare all'utente **il motivo** di tale suggerimento.

**YReccomend** nasce per colmare questa lacuna. È una piattaforma che integra un modello di Deep Learning basato su Knowledge Graph (PGPR) con un'interfaccia interattiva visuale.
L'obiettivo è fornire raccomandazioni non solo accurate, ma **trasparenti e spiegabili**, mostrando all'utente il percorso logico che collega i suoi interessi ai nuovi contenuti suggeriti (es. *Hai visto Film A → diretto da Regista X → che ha diretto anche il Film suggerito B*).


---

## 3. 🏗️ Architettura del Sistema <a name="3-architettura-del-sistema"></a>

Il progetto **YReccomend** è costruito su un'architettura modulare a tre livelli, progettata per disaccoppiare l'interfaccia utente dalla logica di calcolo del modello. Questa struttura garantisce scalabilità, manutenibilità e una chiara separazione delle responsabilità tra visualizzazione e ragionamento e, non essendo vincolata ad un modello preciso è pensata per adattarsi a diversi modelli di raccomandazione.

### Flusso dei Dati

1.  **Elaborazione Backend:** In fase di pre-calcolo viene caricato il modello addestrato e il dataset, contente i dati grezzi e gli embeddings.
3.  **Data Fetching :** L'interfaccia client-side, una volta caricata, esegue una chiamata asincrona per ricevere il file JSON di uno specifico utente e delle sue preferenze
4.  **Rendering Grafico:** L'interfaccia elabora i dati del JSON, calcola la fisica dei nodi e renderizza il grafo interattivo, permettendo all'utente di esplorare visivamente le connessioni tra le entità.

### Dettaglio dei Componenti

#### A. Frontend
Il livello di presentazione è responsabile della visualizzazione del **Knowledge Graph** e dell'interazione con l'utente finale.

* **Tecnologia:** HTML5, CSS3, Vanilla JavaScript con **D3.js**.
* **Funzioni Chiave:**
    * **Visualizzazione Grafica**:Dispone i nodi come degli item nello spazio in modo organico, minimizzando le sovrapposizioni.
    * **Interattività**: Gestisce eventi complessi come Zoom, Riorganizzazione, Selezione e Hover dei nodi per un' esperienza più personalizzabile.
    * **Filtraggio Dinamico:** Permette di nascondere o mostrare intere categorie di nodi (es. Attori, Registi) senza ricaricare la pagina.


#### B. Agente di Raccomandazione (???)
Il cuore computazionale del sistema, dove risiede la logica di raccomandazione profonda.

* **Tecnologia:** **Python 3**, **PyTorch**, **NumPy**, **Pandas**.
* **Modello**: PGPR
* **Funzioni Chiave**:
    * **Data Loading**: Analizza e carica in memoria i file atomici del formato RecBole (`.inter`, `.kg`, `.item`) ricostruendo la topologia del grafo.
    * **Model Loading**: Inizializza la rete neurale caricando i tensori dei pesi pre-addestrati dal file `.pth`.
    * **Path Reasoning**: Esegue l'algoritmo di ricerca su grafo per identificare i percorsi che collegano l'utente agli item target (es. *Utente -> ha visto Film A -> diretto da Regista X -> che ha diretto Film B*).
    * **JSON Export**: Serializza l'output in un formato JSON ottimizzato per il web, includendo metadati, score normalizzati e la struttura gerarchica della spiegazione.

### Ciclo di Vita di una Raccomandazione

1.  **Avvio**: Lo script di inferenza `inference.py` viene eseguito (manualmente o automaticamente).
2.  **Elaborazione**: Il modello esplora il Knowledge Graph per un determinato `User_ID` target, selezionando i `Top_K` item con il punteggio di compatibilità più alto.
3.  **Costruzione Spiegazione**: Per ogni raccomandazione identificata, il sistema estrae il percorso semantico più forte che giustifica la scelta.
4.  **Pubblicazione**: I dati elaborati vengono scritti su disco nel percorso `public/data/recommendations.json`.
5.  **Fruizione**: L'utente apre l'interfaccia web; il browser scarica il nuovo JSON e l'interfaccia "disegna" la storia dietro ogni raccomandazione in tempo reale.

## 4. ✨ Funzionalità Principali <a name="4-funzionalità-principali"></a>

YReccomend non è una semplice lista di film suggeriti, ma uno strumento di esplorazione visiva. Ecco le funzionalità chiave che distinguono il progetto:

### Explanation & Storytelling
* **Visualizzazione dei Percorsi:** Ogni raccomandazione mostra visivamente il "percorso di ragionamento" del modello (es. *Utente* $\to$ *Interagito con Film A* $\to$ *Diretto da Regista X* $\to$ *Ha diretto Film Raccomandato*).
* **Story Mode**: Una modalità narrativa passo-passo che guida l'utente nella comprensione del suggerimento, scomponendo la logica in tre fasi: *La Raccomandazione*, *La Strategia*, e *Le Connessioni*.
* **Knowledge Graph Isolato**: Quando si seleziona un nodo, il sistema genera un mini-grafo dedicato che mostra esclusivamente le entità coinvolte nella spiegazione, rimuovendo il rumore di fondo.

### Visualizzazione Interattiva
* **Graph visualization**: I nodi vengono organizzati dinamicamente nello spazio, raggruppando visivamente elementi correlati.
* **Navigazione Avanzata**: Supporto completo per **ingrandimento**, **selezione** e **organizzazione** per personalizzare l'esperienza utente
* **Semantic Aura**: I nodi differiscono per colore, contorno e dimensione in base al *punteggio di confidenza* assegnato dal modello ad un determinato item.

### Pannello di Controllo e Filtri
* **Filtri per Tipo Entità**: L'utente può scegliere di visualizzare o nascondere specifiche categorie di nodi (es. mostrare solo *Film* e *Attori*, nascondendo *Registi* o *Generi*) tramite un pannello laterale.
* **Soglia di Confidenza**: Un selettore permette di filtrare i risultati in base alla certezza del modello (es. mostrare solo raccomandazioni con match > 90%).
* **Configurazione Top-K**: Slider dinamico per decidere in tempo reale quante raccomandazioni visualizzare nel grafo (da 5 a 50 item).

### Dettagli On-Demand
* **Info Card Laterale:** Cliccando su un nodo, appare una scheda dettagliata con:
    * Titolo e Metadata dell'item.
    * Percentuale di compatibilità.
    * Spiegazione sintetica della strategia usata (es. *"Basato su Genere Simile"*).
* **Tooltip Immediati:** Passando il mouse sui nodi (Hover), vengono mostrati dati rapidi come il nome dell'entità e il tipo
* **Knowledge Graph Path** 
     * Non avendo selezionato nessun nodo viene visualizzata la connessione dell'item principale (l'utente) con gli item più rilevanti.
     * Selezionando un nodo viene visualizzato il suo percorso nel path, con la possibilità di ingrandirlo e viualizzarlo a schermo intero.

## 5. 📂 Struttura della Repository <a name="5-struttura-della-repository"></a>

L'organizzazione del codice è stata progettata seguendo il principio della **Separation of Concerns (SoC)**. Il progetto è suddiviso in tre macro-aree logiche distinte che comunicano tra loro attraverso file di configurazione e dati JSON.

Di seguito è riportato l'albero completo delle directory con una descrizione dettagliata di ogni componente:

    YReccomend/
    ├── 📂 engine/                   
    │   ├── 📂 config/
    │   │   └── 📄 domain_config.json 
    │   ├── 📂 custom_data/          
    │   │   ├── 📄 custom_data.inter  
    │   │   ├── 📄 custom_data.kg     
    │   │   ├── 📄 *.entityemb        
    │   │   └── 📄 ... (altri file di dati)
    │   ├── 📂 models/
    │   │   └── 📄 PGPR-Dec-...pth
    │   └── 🐍 generate_configurable_recs.py
    │
    ├── 📂 log/PGPR               
    │       └── 📄 PGPR-custom_data....log    
    │
    ├── 📂 public/                   
    │   ├── 📂 css/
    │   │   └── 📄 style.css         
    │   ├── 📂 data/  
    │   │   ├── 📄 theme.json
    │   │   └── 📄 mock_recs.json    
    │   ├── 📂 js/
    │   │   └── 📄 app.js            
    │   └── 📄 index.html            
    │
    ├── 📂 server/                   
    │   └── 📄 server.js             
    ├── 📄 .gitignore                
    ├── 📄 package.json              
    ├── 📄 package-lock.json     
    ├── 📄 requirements.txt
    ├── 📄 .dockerignore
    ├── 📄 Dockerfile
    ├── 📄 yreccomend.tar
    └── 📝 README.md                 
    
### Guida ai Moduli

Per facilitare la navigazione, ecco una spiegazione delle tre sezioni principali che compongono l'architettura del progetto:

#### 1. Modulo `engine/` (Backend)
È il nucleo computazionale del sistema, responsabile del caricamento del Knowledge Graph e dell'esecuzione degli algoritmi di raccomandazione.
* **Core Script**: Il file `generate_configurable_recs.py` carica i pesi del modello dalla cartella `models/` e processa i dati grezzi presenti in `custom_data/`.
* **Data Processing**: Utilizza file di embedding (`.entityemb`, `.useremb`) e strutture di grafo (`.kg`) per calcolare i percorsi di raccomandazione più rilevanti.
* **Output**: Al termine dell'esecuzione, esporta i risultati in `public/data/recommendations.json`, agendo come fornitore di dati per l'interfaccia web.
* **Nota**: I file pesanti (come i `.pth` e gli embedding in `custom_data/`) sono tipicamente esclusi dal versionamento tramite `.gitignore` e devono essere gestiti separatamente.

#### 2. Modulo `public/` (Frontend)
Rappresenta l'interfaccia utente interattiva (Dashboard) ed è ottimizzato per la visualizzazione di strutture dati complesse.
* **Visualizzazione Dinamica**: Utilizza la libreria **D3.js** per trasformare i dati JSON prodotti dall'engine in un grafo interattivo esplorabile.
* **Architettura**: Sviluppato in Vanilla JS (ES6+) per garantire prestazioni elevate nel rendering dei nodi senza il sovraccarico di framework esterni.
* **Data Flow**: All'avvio, lo script `app.js` effettua una richiesta `fetch` verso `data/mock_recs.json`. Se il file è aggiornato, l'utente vedrà i nuovi percorsi generati dal modello.

#### 3. Modulo `server/` (Web Server)
Costituisce l'infrastruttura di rete necessaria per l'esecuzione corretta dell'applicazione.
* **Server Express**: Implementato in `server.js`, gestisce il routing delle risorse statiche e permette al browser di accedere ai file JSON superando le restrizioni di sicurezza locali (CORS).
* **Gestione Risorse**: Assicura che i file JavaScript vengano serviti con i corretti header MIME, necessari per il funzionamento degli ES Modules utilizzati nel frontend.
* **Scalabilità**: La struttura è predisposta per integrare API REST aggiuntive che potrebbero permettere all'utente di inviare input in tempo reale al motore Python.

## 6. 🛠️ Prerequisiti e Installazione <a name="6-prerequisiti-e-installazione"></a>

Il progetto è composto da due muoduli principali (backend e interfaccia), per facilitare la comprensione, i prerequisiti e l'installazione per questi moduli verranno trattati separatamente, inoltre i prerequisiti relativi al backend riguardano specificatamente il modello che abbiamo utilizzato per gli script di generazione e la nostra interfaccia.

### Backend
Questa componente è sviluppata in Python 3.8+ e si basa sul framework Hopwise. Per garantire la riproducibilità e isolare le dipendenze, si raccomanda l'utilizzo di un ambiente virtuale.

#### Requisiti di sistema
* **OS**: Linux (testato su Ubuntu/WSL)
* **Python**: versione 3.8 o superiore
* **GPU**: NVIDIA con CUDA per l'addestramento

### Frontend

#### Requisiti di sistema
* **Browser** Google Chrome, Firefox o Edge  con supporto a ES6+ e supporto a SVG
* **Runtime** Node.js versione 16.0 o superiore
* **Risoluzione**: 1920x1080 
* **Hardware Client**: CPU Multicore La simulazione fisica viene calcolata in tempo reale dal browser dell'utente, non dal server.

### Guida all'Installazione

1.  **Clonare il repository**:
    ```bash
    git clone [https://github.com/tuo-username/tuo-progetto.git](https://github.com/tuo-username/tuo-progetto.git)
    cd tuo-progetto
    ```

2.  **Creare e attivare l'ambiente virtuale**:
    ```bash
    # Su Linux / macOS
    python3 -m venv venv
    source venv/bin/activate
    
    # Su Windows (PowerShell)
    python -m venv venv
    .\venv\Scripts\Activate.ps1
    ```

3.  **Installare le dipendenze**:
    Tutte le librerie necessarie sono elencate nel file standard `requirements.txt`.
    ```bash
    pip install -r requirements.txt
    ```

4. **Verifica dell'Installazione**
   Per verificare che l'ambiente sia configurato correttamente e che `hopwise` sia accessibile, eseguire:
   ```bash
   python -c "import hopwise; print(f'Hopwise version installed successfully')"
   ```
5. **Generazione raccomandazioni**
   Genera il file di raccomandazioni in formato JSON
   ```bash
   cd engine
   python generate_configurable_recs.py
   ```

## 7. 🧠 Configurazione del Dataset e Modello <a name="7-configurazione-del-dataset-e-modello"></a>

Il modello PGPR (Policy-Guided Path Reasoning) è un agente di Reinforcement Learning che opera su un Knowledge Graph. Affinché l'agente possa "navigare" il grafo per trovare raccomandazioni, i dati devono essere forniti in due stadi distinti: **Struttura del grafo** ed **Embeddings**, il progetto inoltre utilizza il formato standard **RecBole/Hopwise** 

### 📊 7.1 Topologia e metadati 

Questi file definiscono le connessioni fisiche tra le entità. Si trovano nella cartella `dataset/custom` e devono seguire il formato **RecBole**, i file nello specifico sono i seguenti:

* **`custom_data.kg`**: Definisce la struttura del ambiente di cui volgiamo fornire le raccomandazioni, è una lista di triplette **testa->relazione->coda** (es. *Film -> Diretto da -> Regista*).
* **`custom_data.inter`**: Contiene lo storico delle interazioni (User ID, Item ID, Rating/Click) ed è la base per calcolare le preferenze dell'utente, sono coppie **UserID <-> ItemID** con associato un rating.
* **`custom_data.item`**: Serve a mappare gli ID interni di Hopwise con quelli delle entità del Knowldge Graph, si utilizza per associare un'etichetta leggibile (es. titolo del film) agli ID numerici delle raccomandazioni.
* **`custom_data.link`**:File indispensabile se gli ID degli oggetti nel file interazioni (`item_id`) differiscono dagli ID nel Knowledge Graph (`entity_id`). Agisce come un dizionario per dire al modello che l'item X corrisponde al nodo Y nel grafo.
* **`custom_data.user`**: Contiene le feature esplicite di ogni utente (età, sesso, ocupazione, etc.), questo file nel nostro modello è opzionale, è utile qualora si volessero definire regole basate sulla demografia.


###  7.2 Configurazione Semantica
**PGPR** non apprende le rappresentazioni delle entità da zero; richiede uno "stato iniziale" pre-addestrato per orientarsi nel grafo. Questi vettori devono essere generati preventivamente (nel nostro caso tramite **TransE**) ed esportati.

I tre file di embeddings generati sono qui riportati:

1.  **`custom_data.useremb`:** Contiene gli embedding degli utenti, dove questi sono rappresentati come punto nello spazio multi-vettoriale, in questo modo utenti vicini nello spazio hanno gusti simili.
2.  **`custom_data.entityemb`:** Contiene gli embedding di tutto ciò che non è utente, sempre rappresentati come punti nello spazio multi-vettoriale.
3.  **`custom_data.relationemb`:** Le relazioni sono rappresentate come **Vettore di Traslazione**, da qui appunto TransE, il contentuto di questo file rappresenta le "indicazioni" per raggiungere un entità partendo da un'altra, attraverso una somma vettoriale (Big Lebowski + directed_by = Coen.bros)

### Utilizzo di altri dataset
Il motore di ragionamento "non sa" di lavorare con film o prodotti, naviga semplicemente un grafo astratto definito dai file su cui lavora,per utilizzare un altro dataset è sufficiente rispettare la topologia dei file descritta sopra e mantenere invariata la logica di connessioene.

## 8. 🚀 Guida all'Avvio <a name="8-guida-allavvio-quick-start"></a>

Per vedere il sistema in azione, segui questi passaggi nell'ordine esatto. Il flusso prevede prima la generazione dei dati tramite il motore AI (Python) e successivamente l'avvio del server di visualizzazione (Node.js).

### 🔄 8.1 Passo 1: Generare le Raccomandazioni (Python)
L'interfaccia web legge i dati pre-calcolati dal JSON. Prima di avviare il sito, è necessario eseguire lo script di inferenza per produrre le raccomandazioni e le relative spiegazioni.

1.  Apri il terminale e spostati nella cartella `engine`:
    `cd engine`

2.  (Opzionale) Attiva il tuo ambiente virtuale Python (vedi Sezione 6).

3.  Esegui lo script di inferenza:
    `python inference.py`

**Cosa succede in background?**
* Lo script carica il modello `.pth` e la struttura del Knowledge Graph.
* Esegue il ragionamento (Path Reasoning) per trovare i percorsi logici.
* Genera e salva il risultato nel file `../public/data/mock_recs.json`.
* *Output atteso:* Vedrai un messaggio di conferma "JSON salvato correttamente".

---

### 🌐 8.2 Passo 2: Avviare l'Interfaccia (Node.js)
Una volta generati i dati, puoi avviare il server web per visualizzarli.

1.  Apri un **nuovo terminale** (o torna alla cartella principale).
2.  Spostati nella cartella `server`:
    `cd server`

3.  Avvia il server Express:
    `node server.js`

**Output atteso:**
> UI pronta: http://localhost:5173

---

### 🖥️ 8.3 Passo 3: Esplorazione
1.  Apri il browser (Chrome, Firefox o Edge).
2.  Digita l'indirizzo: **http://localhost:5173**
3.  Il grafo interattivo apparirà automaticamente, mostrando le raccomandazioni generate al Passo 1.

### ⚠️ Nota Importante sul Workflow
Attualmente il sistema opera in modalità **Batch**: l'interfaccia visualizza l'ultimo snapshot di dati generato.
Se desideri visualizzare le raccomandazioni per un **Utente diverso**:
1.  Modifica l'ID utente nello script `engine/inference.py` (o passalo come argomento se configurato).
2.  Riesegui `python inference.py`.
3.  Aggiorna la pagina web (F5).

## 9. 🐳 Guida all'Avvio con Docker <a name="9-guida-docker"></a>

Se preferisci non installare Node.js o vuoi testare l'applicazione in un ambiente isolato, puoi utilizzare Docker in modo tale da avviare automaticamente il server web con i dati pre-caricati.

### 9.1 Caricamento e Avvio
Assicurati di avere **Docker Desktop** installato e attivo.
Apri il terminale nella cartella ed esegui:

1.  **Importa l'immagine:**
    ```bash
    docker load -i yreccomend.tar
    ```
    *(Attendi il messaggio di conferma)*

2.  **Avvia il container:**
    ```bash
    docker run -p 5173:5173 yreccomend
    ```

*Assicurati che la porta 5173 non sia occupata*

### 9.2 Accesso
Una volta avviato, apri il tuo browser preferito e visita:
👉 **http://localhost:5173**

> **Nota:** Il container Docker funge da "Visualizzatore Interattivo", contiene una copia statica dei dati presenti in `mock_recs.json` impacchettati al momento della creazione del file `.tar`.

## 10. 🎨 Interfaccia Utente e Controlli <a name="10-interfaccia-utente-e-controlli"></a>

L'interfaccia non serve solo a mostrare i risultati, ma è pensata per essere esplorabile ed interattiva: è strutturata in modo dinamico con **D3.js**, gestendo la visualizzazione dei nodi e delle relazioni in tempo reale direttamente nel browser.

### 10.1 Main Canvas
Questa è l'area principale dove vengono disegnate e visualizzate le raccomandazioni.

* **Interazione Fisica**: I nodi si comportano come particelle fisiche e possono essere trascinati, può essere spostata la vista e si può zoomare per vedere i dettagli, con il layout che si riadatta automaticamente.
* **Feedback Visivo**: Ogni nodo ha un'aura colorata che indica quanto il modello è "sicuro" di quella raccomandazione, più è tendente al verde e più è alto lo score mentre più è tendente al rosso e meno sarà alto lo score. Inoltre, i nodi più importanti "pulsano" leggermente per attirare l'attenzione.

### 10.2 Pannelli di Controllo
Sulla sinistra ci sono i controlli per modificare la visualizzazione senza dover ricaricare la pagina. Vengono generati via JavaScript leggendo i dati disponibili nel JSON.

* **Filtri per Tipo**: Puoi accendere o spegnere intere categorie di nodi (es. nascondere i *Registi* per vedere solo i *Film*), c'è anche un tasto rapido per selezionare tutto o niente.
* **Modalità Layout**: Cambia l'algoritmo con cui D3 dispone i nodi nello spazio:
    * **Orbitali**: Mette l'utente al centro e gli item attorno, a distanze diverse in base alla rilevanza.
    * **Griglia**: Dispone i nodi in una griglia ordinata, utile se ci sono molti dati.
    * **Cluster**: Raggruppa i nodi in base alla strategia di spiegazione, ad esempio mette vicini tutti i film suggeriti per lo stesso motivo.
* **Soglia di Rilevanza**: Un filtro rapido per escludere dalla visualizzazione i risultati con uno score al di sotto della soglia: Alta/Media/Bassa.
* **Impostazioni Fisiche**: Impostazioni per regolare la distanza tra i nodi o quanti elementi evidenziare.

### 10.3 Explainability
Quando viene selezionato un nodo, si attivano due elementi per spiegare *perché* quell'item è stato raccomandato:

1.  **Info Card**: Un pannello laterale che mostra il titolo, la percentuale di match e le entità in comune tra l'utente e l'item.
2.  **Mini-Grafo del Percorso**: Un piccolo riquadro che isola il percorso logico esatto (es. *Utente* -> *ha visto Film A* -> *diretto da Regista X* -> *che ha fatto Film B*). Si può anche espandere a tutto schermo per analizzarlo meglio.

### 10.4 Story Mode
Per rendere le spiegazioni più comprensibili anche a chi non è tecnico, è stata implementata anche una modalità "Story". Invece di mostrare solo dati grezzi, guida l'utente attraverso tre passaggi:
1.  **La Raccomandazione**: Presenta l'item e quanto è compatibile.
2.  **Il Perché**: Spiega in parole semplici la strategia usata (es. "Basato su un regista che ti piace").
3.  **Le Connessioni**: Mostra quali elementi del Knowledge Graph collegano l'utente al risultato.

## 11. 📄 Licenza e Contatti<a name="11-licenza"></a>
### Licenza  
Questo software è rilasciato sotto licenza **MIT**.
Libertà di utilizzare, modificare e distribuire questo codice per scopi accademici, personali o commerciali, a condizione di includere l'attribuzione originale agli autori (**Alessandro Bullegas** e **Daniele Nieddu**).

> Il dataset utilizzato potrebbe essere soggetto a licenze separate. Si prega di verificare i termini di utilizzo dei dati originali per uso commerciale.

### Contatti
* **Alessandro Bullegas** - [GitHub Profile](https://github.com/alebullegas)
* **Daniele Nieddu** - [GitHub Profile](https://github.com/danielenieddu)

---
