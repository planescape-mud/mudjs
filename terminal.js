
// for easy scripting in triggers
function echo(txt) {
    $('#terminal').trigger('output', [txt]);
}

window.indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
window.IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.msIDBTransaction || {READ_WRITE: "readwrite"};
window.IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange;

var lastChunkId = -1;

var database = new Promise(function(accept, reject) {
    var request = window.indexedDB.open('dreamland', 1);

    request.onupgradeneeded = function(e) { 
        var db = request.result;
        console.log('upgrade');

        db.createObjectStore('terminal', { autoIncrement: true, keyPath: null });
    };

    request.onerror = function(e) {
        console.log('error');
    };

    request.onsuccess = function(e) {
        accept(request.result);
    };
});

$.fn.terminal = function() {
    var terminal = this;
    /*
     * Handlers for plus-minus buttons to change terminal font size.
     */ 
    var fontDelta = 2;
    
    function changeFontSize(delta) {
        var style = terminal.css('font-size'); 
        var fontSize = parseFloat(style); 
        terminal.css('font-size', (fontSize + delta) + 'px');
    }

    $('#font-plus-button').click(function(e) {
        e.preventDefault();
        changeFontSize(fontDelta);
    });

    $('#font-minus-button').click(function(e) {
        e.preventDefault();
        changeFontSize(-fontDelta);
    });

    $('#download-button').click(function(e) {
        e.preventDefault();

        database
            .then(function(db) {
                return new Promise(function(accept) {
                    var blobOpts = { type: 'text/html' };
                    var buf = ''; // TODO: this should be an incrementally created blob instead of a string
                    var ds = db.transaction(['terminal']).objectStore('terminal');

                    ds.openCursor(null, 'prev').onsuccess = function(e) {
                        var next = e.target.result;
                        if(next) {
                            buf = next.value + buf;
                            next.continue();
                            return;
                        }

                        var blob = new Blob([buf], blobOpts);
                        accept(URL.createObjectURL(blob));
                    };
                });
            })
            .then(function(url) {
                console.log(url);
                var link = $('<a>')
                    .attr({
                        href: url,
                        download: 'mudjs.log'
                    })
                    [0];

                    //.appendTo($('body'))
                    //.text('click me')
                    //.trigger('click')
                   // [0].click();
                        //var link = document.createElement('a');
                          //  link.setAttribute('href',url);
                            //    link.setAttribute('download', 'mudjs.log.html');
                    setTimeout(function() {
                        var event = document.createEvent('MouseEvents');
                            event.initMouseEvent('click', true, true, window, 1, 0, 0, 0, 0, false, false, false, false, 0, null);
                            link.dispatchEvent(event);
                    }, 1000);
                    //.remove();

                //URL.revokeObjectURL(url);
            });
        
    });

    this.on('output', function(e, txt) {
        var html = ansi2html(txt);

        database
            .then(function(db) {
                return new Promise(function(accept) {
                    db.transaction(['terminal'], 'readwrite').objectStore('terminal')
                        .add(html)
                        .onsuccess = function(e) {
                            accept(e.target.result)
                        };
                });
            })
            .then(function(id) {
                var $chunk = $('<span>')
                    .append(html)
                    .attr('data-chunk-id', id);
                
                // only append the new chunk if we had the latest
                var $lst = terminal.find('span[data-chunk-id]:last-child');

                if($lst.length === 0 || parseInt($lst.attr('data-chunk-id')) === lastChunkId) {
                    terminal.trigger('append', [$chunk]);

                    if(terminal.children().length > 100)
                        terminal.children(':first').remove();
                }

                lastChunkId = id;

                var lines = $chunk.text().replace(/\xa0/g, ' ').split('\n');
                $(lines).each(function() {
                    $('.trigger').trigger('text', [''+this]);
                });
            });
    });

    this.on('append', function(e, $txt) {
        var atBottom = $('#terminal-wrap').scrollTop() > (terminal.height() - $('#terminal-wrap').height() - 50);
        $txt.appendTo(terminal);

        // only autoscroll if near the bottom of the page
        if(atBottom) {
            $('#terminal-wrap').scrollTop(terminal.height());
        }
    });

    return this;
};

function terminalInit() {
    var terminal = $('#terminal').terminal();

    return database
        .then(function(db) {
            return new Promise(function(accept) {
                var loaded=0;
                var ds = db.transaction(['terminal']).objectStore('terminal');
                
                ds.openCursor(null, 'prev').onsuccess = function(e) {
                    var next = e.target.result;
                    if(next) {
                        var $chunk = $('<span>')
                            .append(next.value)
                            .attr('data-chunk-id', next.key);

                        terminal.prepend($chunk);

                        loaded += next.value.length;

                        if(loaded < 5000) {
                            next.continue();
                            return;
                        }
                    }

                    accept();
                };
            });
        })
        .then(function() {
            var scrolling = false;

            function append(html) {
                terminal.trigger('append', [$(html)]);
            }

            append('<hr>');
            append(ansi2html('\u001b[1;31m#################### HISTORY LOADED ####################\n'));
            append('<hr>');

            $('#terminal-wrap')
                .scrollTop(terminal.height()) // scroll to the bottom
                .on('scroll', function(e) {
                    if(scrolling) {
                        e.preventDefault(); // XXX is it required?
                        return;
                    }

                    if($('#terminal-wrap').scrollTop() < 1000) {
                        var $fst = terminal.find('span[data-chunk-id]:first-child');

                        if($fst.length > 0) {
                            var off = $fst.offset().top;
                            var fstId = parseInt($fst.attr('data-chunk-id'));
                            var range = IDBKeyRange.upperBound(fstId, true); // exclusive

                            scrolling = true;
                            
                            database
                                .then(function(db) {
                                    var loaded=0;
                                    var ds = db.transaction(['terminal']).objectStore('terminal');
                                    ds.openCursor(range, 'prev').onsuccess = function(e) {
                                        var next = e.target.result;
                                        if(next) {
                                            var $chunk = $('<span>')
                                                .append(next.value)
                                                .attr('data-chunk-id', next.key);

                                            terminal.prepend($chunk);
                                            if($('#terminal').children().length > 100) {
                                                $('#terminal').children(':last').remove();
                                            }
                                            $('#terminal-wrap').scrollTop($('#terminal-wrap').scrollTop() + $fst.offset().top - off);

                                            loaded += next.value.length;

                                            if(loaded < 5000) {
                                                next.continue();
                                                return;
                                            }
                                        }

                                        scrolling = false;
                                    };
                                });
                        }
                    }

                    if($('#terminal-wrap').scrollTop() > (terminal.height() - $('#terminal-wrap').height() - 1000)) {
                        var $lst = terminal.find('span[data-chunk-id]:last-child');

                        if($lst.length > 0) {
                            var off = $lst.offset().top;
                            var lstId = parseInt($lst.attr('data-chunk-id'));
                            if(lstId === lastChunkId)
                                return;
                            var range = IDBKeyRange.lowerBound(lstId, true); // exclusive

                            scrolling = true;
                            
                            database
                                .then(function(db) {
                                    var loaded=0;
                                    var ds = db.transaction(['terminal']).objectStore('terminal');
                                    ds.openCursor(range, 'next').onsuccess = function(e) {
                                        var next = e.target.result;
                                        if(next) {
                                            var $chunk = $('<span>')
                                                .append(next.value)
                                                .attr('data-chunk-id', next.key);

                                            terminal.append($chunk);
                                            if($('#terminal').children().length > 100) {
                                                $('#terminal').children(':first').remove();
                                            }
                                            $('#terminal-wrap').scrollTop($('#terminal-wrap').scrollTop() + $lst.offset().top - off);

                                            loaded += next.value.length;

                                            if(loaded < 5000) {
                                                next.continue();
                                                return;
                                            }
                                        }

                                        scrolling = false;
                                    };
                                });
                        }
                    }
                });

        });
}
