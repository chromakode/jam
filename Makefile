run:
	if [ ! -z "`which open`" ]; then open http://localhost:8080/src/jam.html; fi
	python -m SimpleHTTPServer 8080
