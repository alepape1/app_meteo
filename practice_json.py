import json

DB = []

data = {
    "temperature":0.0,
    "pressure": 0.0
}

for i in range(10):
    DB.append(data)

print(DB)
print(type(DB))

DB_json = json.dumps(DB)

print(type(DB_json))