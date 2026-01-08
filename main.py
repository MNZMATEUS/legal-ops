import os
import numpy as np
from fastapi import FastAPI, HTTPException
from sqlalchemy import create_engine, text
from datetime import datetime
from pydantic import BaseModel

app = FastAPI()

# --- CONFIGURAÇÃO DO BANCO ---
# O Render vai injetar a senha através de uma variável de ambiente chamada DATABASE_URL
DATABASE_URL = os.getenv("DATABASE_URL")

# Tratamento de erro caso a pessoa esqueça de configurar a variável
if not DATABASE_URL:
    raise RuntimeError("CRÍTICO: A variável DATABASE_URL não foi encontrada!")

# Correção para o Render (algumas strings vem como postgres:// e o SQLAlchemy quer postgresql://)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL)

# --- MODELOS DE DADOS ---
class PrevisaoRequest(BaseModel):
    data_futura: str
    id_produto: int

# --- ROTAS DA API ---

@app.get("/")
def home():
    return {"status": "online", "mensagem": "API de Vendas de Combustível rodando!"}

@app.get("/produtos")
def listar_produtos():
    with engine.connect() as conn:
        result = conn.execute(text("SELECT id, nome FROM tb_produtos ORDER BY nome"))
        return [{"id": row.id, "nome": row.nome} for row in result]

@app.post("/predict")
def prever_venda(request: PrevisaoRequest):
    data_futura_str = request.data_futura
    id_produto = request.id_produto

    with engine.connect() as conn:
        # 1. Preparação
        try:
            data_obj = datetime.strptime(data_futura_str, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Data inválida. Use AAAA-MM-DD")

        dia_semana_python = data_obj.weekday()
        dia_semana_sql = dia_semana_python + 1 
        
        # 2. Busca Histórico (8 semanas)
        sql = text("""
            SELECT volume, data
            FROM tb_movimento_diario 
            WHERE id_produto = :prod_id 
            AND EXTRACT(ISODOW FROM data) = :dia_semana
            ORDER BY data DESC 
            LIMIT 8
        """)
        
        result = conn.execute(sql, {"prod_id": id_produto, "dia_semana": dia_semana_sql}).fetchall()
        
        if len(result) < 3:
            return {"erro": "Dados insuficientes (mínimo 3 semanas históricas).", "volume_estimado": 0}

        # Organiza
        dados_brutos = sorted(result, key=lambda x: x.data)
        volumes_brutos = [float(row.volume) for row in dados_brutos]

        # 3. Filtro de Outliers (Mediana)
        mediana = np.median(volumes_brutos)
        limite_minimo = mediana * 0.50 
        limite_maximo = mediana * 1.50

        volumes_limpos = [v for v in volumes_brutos if limite_minimo <= v <= limite_maximo]

        if len(volumes_limpos) < 2:
            return {"erro": "Histórico muito instável (muitos feriados/anomalias).", "volume_estimado": 0}

        # Pega os últimos 4 válidos
        volumes_finais = volumes_limpos[-4:] 

        # 4. Média Ponderada e Tendência
        n = len(volumes_finais)
        pesos = list(range(1, n + 1)) 
        media_ponderada = sum([val * p for val, p in zip(volumes_finais, pesos)]) / sum(pesos)
        
        diferencas = []
        for i in range(1, len(volumes_finais)):
            diferencas.append(volumes_finais[i] - volumes_finais[i-1])
        
        tendencia = sum(diferencas) / len(diferencas) if diferencas else 0

        previsao_final = media_ponderada + tendencia
        
        # Travas de segurança (+- 30% da mediana)
        if previsao_final > mediana * 1.3: previsao_final = mediana * 1.3
        if previsao_final < mediana * 0.7: previsao_final = mediana * 0.7

        return {
            "data": data_futura_str,
            "produto_id": id_produto,
            "volume_estimado": round(previsao_final, 2),
            "detalhes": {
                "mediana_historica": round(mediana, 2),
                "tendencia_detectada": round(tendencia, 2),
                "historico_usado_qtd": len(volumes_finais)
            }
        }
