from fastapi import FastAPI

app = FastAPI(title="SnapFit AI Service")


@app.get("/health")
def health():
    return {"status": "ok", "service": "snapfit-ai"}
