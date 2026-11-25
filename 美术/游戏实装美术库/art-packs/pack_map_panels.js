(function (global) {
  'use strict';

  var SPRITE_DATA = {"rollerCapL":{"w":26,"h":22,"p":{"K":"#0c121a","G":"#ffe27a","g":"#dca338","o":"#996520","B":"#7d4f2c","b":"#54331b","u":"#361f10"},"r":["..........................","..........KKKK............",".........KggggK...........","....KKKK.KGGGGKKKKKKKKKKKK","...KggggKKGGGGbbbbbbbbbbbb","..KGGGGggKGGGGBBBBBBBBBBBB",".KGGGGGGggGGGGBBBBBBBBBBBB",".KGGGGGGggggggBBBBBBBBBBBB","KgGGGGGGggggggbbbbbbbbbbbb","KGGGGGGGggggggbbbbbbbbbbbb","KGGGGGGgggggggbbbbbbbbbbbb","KGGgggggggggggbbbbbbbbbbbb","KGGgggggggggggbbbbbbbbbbbb","Kgggggggggggggbbbbbbbbbbbb",".Kggoooooggggguuuuuuuuuuuu",".Kggooooogoooouuuuuuuuuuuu","..KgoooooKoooouuuuuuuuuuuu","...KggggKKoooobbbbbbbbbbbb","....KKKK.KooooKKKKKKKKKKKK",".........KggggK...........","..........KKKK............",".........................."]},"rollerCapR":{"w":26,"h":22,"p":{"K":"#0c121a","G":"#ffe27a","g":"#dca338","o":"#996520","B":"#7d4f2c","b":"#54331b","u":"#361f10"},"r":["..........................","............KKKK..........","...........KggggK.........","KKKKKKKKKKKKGGGGK.KKKK....","bbbbbbbbbbbbGGGGKKggggK...","BBBBBBBBBBBBGGGGKggGGGGK..","BBBBBBBBBBBBGGGGggGGGGGGK.","BBBBBBBBBBBBggggggGGGGGGK.","bbbbbbbbbbbbggggggGGGGGGgK","bbbbbbbbbbbbggggggGGGGGGGK","bbbbbbbbbbbbgggggggGGGGGGK","bbbbbbbbbbbbgggggggggggGGK","bbbbbbbbbbbbgggggggggggGGK","bbbbbbbbbbbbgggggggggggggK","uuuuuuuuuuuugggggoooooggK.","uuuuuuuuuuuuoooogoooooggK.","uuuuuuuuuuuuooooKooooogK..","bbbbbbbbbbbbooooKKggggK...","KKKKKKKKKKKKooooK.KKKK....","...........KggggK.........","............KKKK..........",".........................."]},"lm_tree":{"w":40,"h":40,"p":{"r":"#b82828","y":"#63523b","Y":"#4d3f2c","x":"#33291c","i":"#536449"},"r":["........................................","........................................","........................................","........................................","........................................","........................................","...............xxxxxxxxxx...............",".............xxxxyyyyyyxxxx.............","...........xxxxyyyyyyyyyyxxxx...........","..........xxxyyyyyyyyyyyyyyxxx..........","..........xxyyyyyyyyyyyyyyyyxx..........",".........xxyyyyyyyyyyyyyyyyyyxx.........",".........xxyyyyyyyyyyyyyyyyyyxx.........",".........xxxxxxrxyyyyyyxxxxxxxx.........","........xxxYyyyyxxyyyyxxyyyyYxxx........",".......xYxxYYyyyyyxyyxyyryyYYxxYx.......","......xYYxxYYYyyyyyxxyyyyyYYYxxYYx......","......xYYYxxYYYYyyyxxyyyYYYYxxYYYx......","......xYYYxxxYYYYYYxxYYYYYYxxxYYYx......","......xYYYYxxxxYYYYxxYYYYxxxxYYYYx......",".......xYYYYYxxxxYxiixYxxxxYYYYYx.......","........xxYYYYYxxxxxxxxxxYYYYYxx........",".........xxxxxxxx.xYYx.xxxxxxxx.........","..................xYYx..................","..................xYYx..................","..................xYYx..................","..................xYYx..................","..................xYYx..................","..................xYYx..................","..................xYYx..................","..................xYYx..................","..................xYYx..................","..................xYYx..................","..................xYYx..................","..............r..xxxxxx.................","...........i...xi......ixr..i...........",".........xxxxxxxxxxxxxxxxxxxxxxx........","........................................","........................................","........................................"]},"lm_fern":{"w":40,"h":40,"p":{"y":"#63523b","Y":"#4d3f2c","x":"#33291c","i":"#536449"},"r":["........................................","........................................","........................................","........................................","........................................","........................................","........................................","........................................","........................................","........................................","........................................","........................................","........................................","....................x...................","....................x...................","....................x...................","...................yyy..................","..........iii......yyy......iii.........","..........iii.......x.......iii.........","...........x.......yyy........x.........","...........xiii....yyy....iiix..........","............iii.....x.....iiix..........",".............x.....yyy......x...........",".............xiii..yyy..iiix............","..............iii...x...iii.............","...............x...yyy....x.............","...............xiiiyyyiiix..............",".......YYYYYY...iii.x.iii...............","......YYYYYYYY...x.yyy..x...YYYY........","......YYYYYYYY...xiyiiix...YYYYYY.......",".......YYYYYY.....iiiii....YYYYYY.......",".........yy........xxx......YYYY........",".........yy........xxx.......yy.........",".........yy....YYY..x........yy.........",".......xxxxxxxxYYYxxxxxxxxxxxxxxxx......","........................................","........................................","........................................","........................................","........................................"]},"lm_pillar":{"w":40,"h":40,"p":{"y":"#63523b","Y":"#4d3f2c","x":"#33291c","i":"#536449"},"r":["........................................","........................................","........................................","........................................","........................................","........................................","........................................",".................yy.....................","................yyyy.....y..............","...............yyyyyyy.yyy..............","..............yyyyyyyyyyyy..............","..............yyyyyyyyyyyy..............","..............yYYYYxyyxxxy..............","..............yYYYYxyyxxxy..............",".............iiYYYYyxyxxxy..............",".............iiiYYYyxyxxxy..............","..............iiiYYyxyxxxy..............","..............yiiiiyyxxxxy..............","..............yYYiiiixxxxy..............","..............xxxxxiixxxxx..............","..............yYYYYyyiixxy..............","..............yYYYYyyiixxy..............","..............yYYYYyyyxiiy..............","..............yYYYYyyyxiiy..............","..............yYYYYyyyxxxii.............","..............yYYYYyyyxxxii.............","..............xxxxxxxxxxxxii............","..............yYYYYyyyxxxyii............","..............yYYYYyyyxxii..............","..............yYYYYyyyxxii..............","..............yYYYYyyyiixy..............","..............yYYYYyyyiixy..............","............YYYYYYYYYYYYYYYY............","............YYYYYYYYYYYYYYYY............","............YYYYYYYYYYYYYYYY............","............YYYYYYYYYYYYYYYY............",".........xxxxxxxxxxxxxxxxxxxxxxx........","........................................","........................................","........................................"]},"lm_bramble":{"w":40,"h":40,"p":{"Y":"#4d3f2c","x":"#33291c","i":"#536449"},"r":["........................................","........................................","........................................","........................................","........................................","........................................","........................................","........................................","............xx..........................","............xx..........................","............xxx.YYY.....................",".............xxY...Y..........Y.........",".............xYx....Y.......xx..........",".............Yxx...........xxY..........","..............xx.....Y....xxx...........","............Y.xxx.....Y..xxxY...........","...........Y...xx.......xxxY............","..........Y....xxx....iYYYY.............",".........Y......xx..xxxxx...............","................xxix.xxx.........x......",".................xxxxxx.................",".................xxxxx.x........x.......","..........i......xYxx...................",".................xYY...........x........","..........x......xYx....x.....i.........","................xYxx....................","...........x....xYxx.....xi...x.........","..............i.xYx.....................","............x..xxYx.......x..x.Y........",".............xx.xYx........xx...........","................xYx........Y............","...............YxYx.....................","................Yxx.....................","...............xYxx.....................","...............xYxx.....................","...............xYx......................","........xxxxxxxxxxxxxxxxxxxxxxxxx.......","...............xxx......................","...............xxx......................","........................................"]},"lm_totem":{"w":40,"h":40,"p":{"y":"#63523b","Y":"#4d3f2c","x":"#33291c","i":"#536449"},"r":["........................................","........................................","........................................","........................................","........................................","........................................","...................YY...................",".................YYYYYY.................","................YYYyyYYY................","..............YYYYyyyyYYYY..............",".............YYYyyyyyyyYYYY.............",".............YYyyyyyyyyYYYY.............",".............YYyyyyyyyyYYYY.............",".............YYyyyyyyyyYYYY.............",".............YYyyyxxxxyYYYY.............",".............YYyyyxyyxyYYYY.............",".............YYyyyxyyxyYYYY.............",".............YYyyyxxxxyYYYY.............",".............YYyyyyyyyyYYYY.............",".............YYyyyyyyyyYYYY.............",".............YYyyyyyxyyYYYY.............",".............YYyyyyyxyyYYYY.............",".............YYyyyyyxyyYYYY.............",".............YYyyxxxxxxxYYY.............",".............YYyyyyyxyyYYYY.............",".............YYyyyyyxyyYYYY.............",".............YYyyyyyxyyYYYY.............",".............YYyyyxxxxxYYYY.............",".............YYyyyyyxyyYYYY.............",".............YYyyyyyxyyYiii.............",".............YYyyyyyyyyYiii.............",".............iiiiyyyyyyYiii.............",".............iiiiyyyyyyYiii.............",".............iiiiyyyyyyYYYY.............","............xxYYYYYYYYYYYYYxx...........","..........xx.................xx.........","........xx.....................xx.......","........................................","........................................","........................................"]},"lm_canopy":{"w":40,"h":40,"p":{"y":"#63523b","Y":"#4d3f2c","x":"#33291c","i":"#536449"},"r":["........................................","........................................","........................................","................yyyyyyyyyy..............",".............yyyyyyyyyyyyyyyy...........","...........yyyyyyyyyyyyyyyyyyyy.........","..........xxxxxxxxxxyyyyyyyyyyyy........","........xxxyyyyyyyyxxxyyyyyyyyyyy.......","......xxxyyyyyyyyyyyyxxxyyyyyyyyy.......",".....xxiiyyyyyyyyyyyyyxxxxxxxxxxy.......","....xxxiiyyyyyyyyyyyxxxxxxyyyyyxxx......","....xxiiiiyyyyyyyyxxxyyyxxyyyyyyixxx....","....xxiiiiiyyyyyyxxxyyyyxxyyyyyiiixxx...","....xxiiiiiiiyyyyxxyyyyyxxyyyiiiiiixx...","....xxiiiiiiiiiiyxxyyyyyxxiiiiiiiiixx...","....xxxiiiiiiiiiixxiiiixxxiiiiiiiiixx...",".....xxiiiiiiiiiixxiiiixxiiiiiiiiiixx...","......xxxiiiiiiiixxxixxxiiiiiiiiiixxx...","........xxxYiiiiiixYxxiiiiiYiiiiYxxx....","..........xYxxxxxxxYxxxiiiiYiiixYx......","...........Y......xYx.xxxxxYxxxxY.......","...........Y.......Yxxxxxx.Y....Y.......","...........Y.......Yxxxx...Y....Y.......","...........Y.......Yxxx....Y....Y.......","...........Y......xYxxx....Y....Y.......","...........Y....xxxYxx.....Y....Yi......","...........Y...xxxxYi......Y....Y.......","...........Y..xxxxxY.......Y....Y.......","...........Y.xxxxx.Y.......Yi...Y.......","...........Yixxxx..Y.......Y............","...........Yxxxx...........Y............",".........xxYxxx............Y............","........xxxYxx..........................",".......xxxxxx...........................","......xxxxx.............................","......xxxx..............................","......xxx...............................","........................................","........................................","........................................"]},"lm_compass":{"w":44,"h":44,"p":{"y":"#63523b","Y":"#4d3f2c","x":"#33291c"},"r":["............................................","............................................",".....................yx.....................",".....................yx.....................","....................xyxx....................","................xxxxxyxxxxxx................","..............xxxxxxxyxxxxxxxx..............","............xxxxxxxxyyxyxxxxxxxx............","...........xxxxxxYYYyyxyYYYxxxxxx...........","..........xxxxxYYYYYyyxxYYYYYxxxxx..........",".........xxxxYYYYYY.yyxx.YYYYYYxxxx.........","........xxxxYYYY....yyxx....YYYYxxxx........",".......xxxxYYYY....yyyxxy....YYYYxxxx.......",".......xxxYYYY.....yyyxxy.....YYYYxxx.......","......xxxxYYY.Y....yyyxxy.....YYYYxxxx......","......xxxYYY...Y...yyyxxx....Y..YYYxxx......",".....xxxxYY.....Y..yyyxxx...Y....YYxxxx.....",".....xxxYYY......Yyyyyxxxy.Y.....YYYxxx.....",".....xxxYYY.......yyyyxxxyY......YYYxxx.....",".....xxxYY....yyyyxxxxxxxyyyyy....YYxxx.....","....xxxxYyyyxxxxxxxxxxxxxyyyyyyyyyyYxxxx....","....yxxxxxxxxxxxxxxxxxxxxyyyyyyyyyyyyyyy....","....yyyyyyyyyyyyyyyxxxyxxxxxxxxxxxxxxxxy....","....xxxxYyyyyyyyyyyxxxxxxxxxxxxxyyyYxxxx....",".....xxxYY....yyyyyxxxxxxxyyyy....YYxxx.....",".....xxxYYY.......yxxxyyyy.......YYYxxx.....",".....xxxYYY.......yxxxyyyyY......YYYxxx.....",".....xxxxYY......Y.xxxyyy..Y.....YYxxxx.....","......xxxYYY....Y..xxxyyy...Y...YYYxxx......","......xxxxYYY..Y...yxxyyy....Y.YYYxxxx......",".......xxxYYYYY....yxxyyy.....YYYYxxx.......",".......xxxxYYYY....yxxyyy....YYYYxxxx.......","........xxxxYYYY....xxyy....YYYYYxxx........",".........xxxxYYYYYY.xxyy.YYYYYYxxxx.........","..........xxxxxYYYYYxxyyYYYYYxxxxx..........","...........xxxxxxYYYyxyyYYYxxxxxx...........","............xxxxxxxxyxyyxxxxxxxx............","..............xxxxxxxxyxxxxxxx..............","................xxxxxxyxxxxx................","....................xxyx....................",".....................xy.....................",".....................xy.....................","............................................","............................................"]},"gateBrick":{"w":32,"h":16,"p":{"K":"#0c121a","L":"#79c958","l":"#48913b","M":"#68b891","t":"#3a7a62","T":"#a3a8ad","q":"#6e757a","Q":"#444b50"},"r":["................................","KKKlLlKKKKKKKKtlLlKKKKKKKKlLKKKK","TTTTMltTQTTTTTTTMtTTTTTTQTTTlTTT","TTTTTtTTQTTTTTTTTTTTTTTTQTTtMTTT","qqqqqqqqQqqqqqqqqqqqqqqqQqqqqqqq","qqqqqqqqQqqqqqqqqqqqqqqqQqqqqqqq","qqqqqqqqQqqqqqqqqqqqqqqqQqqqqqqq","QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ","QqqqqqqqqqqqqqqqQqqqqqqqqqqqqqqq","QqqqqqqqqqqqqqqqQqqqqqqqqqqqqqqq","QqqqqqqqqqqqqqqqQqqqqqqqqqqqqqqq","QqqqqqqqqqqqqqqqQqqqqqqqqqqqqqqq","QQQQQQQQQQtQQQQQQQQQQQtQQQQQQQQQ","QQQQQQQQQQQlMQQQQQQQQQQlQQQQQQQQ","KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK","................................"]},"gateClosed":{"w":28,"h":20,"p":{"K":"#0c121a","g":"#dca338","L":"#79c958","l":"#48913b","M":"#68b891","t":"#3a7a62","C":"#9af5ff","c":"#46b8e0","T":"#a3a8ad","q":"#6e757a","Q":"#444b50"},"r":["..........KKKKKKKK..........",".......KKKqqqqqqqqKKK.......","......KqqTTTTTTTTTTqqK......",".....KqTTTqqTCcTqqTTTqK.....","...KKqLTqqqQTTTTQqqqLTqKK...","..KqqlTMqQQQQQKQQQQqqlTqqK..","..KqqTqqtQQQQQKQQQQQqqMqqK..","..KqqTqqQQQQQQKQQQQQqqTqqK..","..KqqTTqQQQQQQKQQQQQqTTqqK..","..KqqqTTQQQcQQKQQcQQTTqqqK..","..KqqqqTQQQCQQKQQCQQTqqqqK..","..KqqqqqQQMQQQKQQQMQqqqqqK..","..KqqqqqQQQQQQKQQQQQqqqqqK..","..KqqqqqQQQQQgKgQQQQqqqlqK..","..KqtqqqQQQQQQKQQQQQqqqqqK..","..KqqqqqQQQQQQKQQQQQqqqqqK..","..KqqqqqQQQQQQKQQQQQqqqqqK..",".KQQQQQQQQQQQQKQQQQQQQQQQQK.",".KQQQQQQQQQQQQQQQQQQQQQQQQK.","..KKKKKKKKKKKKKKKKKKKKKKKK.."]},"gateOpen":{"w":28,"h":20,"p":{"K":"#0c121a","L":"#79c958","l":"#48913b","M":"#68b891","t":"#3a7a62","T":"#a3a8ad","q":"#6e757a","Q":"#444b50","Z":"#241e18","y":"#63523b","Y":"#4d3f2c"},"r":["..........KKKKKKKK..........",".......KKKqqqqqqqqKKK.......","......KqqTTTTTTTTTTqqK......",".....KqTTTqqTMtTqqTTTqK.....","...KKqLTqqqZTTTTZqqqLTqKK...","..KqqlTMqZZZZZZZZZZqqlTqqK..","..KqqTqqtZZZZZZZZZZZqqMqqK..","..KqqTqqZZZZZZZZZZZZqqTqqK..","..KqqTTTTZZZZZZZZZZTTTTqqK..","..KqqqTTTZZZZZZZZZZTTTqqqK..","..KqqqqTTZZZZZZZZZZTTqqqqK..","..KqqqqTTZZZZyyZZZZTTqqqqK..","..KqqqqTTZZZZyyZZZZTTqqqqK..","..KqqqqTTZZZYYYYZZZTTqqlqK..","..KqtqqTTZZZYYYYZZZTTqqqqK..","..KqqqqTTZZZYYYYZZZTTqqqqK..","..KqqqqTTZZZYYYYZZZTTqqqqK..",".KQQQQQQQQQQQQQQQQQQQQQQQQK.",".KQQQQQQQQQQQQQQQQQQQQQQQQK.","..KKKKKKKKKKKKKKKKKKKKKKKK.."]},"node_battle":{"w":28,"h":28,"p":{"K":"#0c121a","W":"#fff9e6","S":"#a9bac9","s":"#6d7f91","d":"#404c5a","D":"#272f38","G":"#ffe27a","g":"#dca338","b":"#54331b","R":"#f04e45"},"r":["............................","............................","...........KKKKKK...........","........KKKddddddKKK........",".......KddssssssssddK.......","......KdssssssssssssdK......",".....KdsssDDDDDDDDsssdK.....","....KdsWSDDDDDDDDDDsWSdK....","...KdssSWSDDDDDDDDDWSSsdK...","...KdssDSWSDDDDDDDWSSssdK...","...KssDDDSWSDDDDDWSSDDssK...","..KdssDDDDSWSDDDWSSDDDssdK..","..KdssDDDDDSWSDWSSDDDDssdK..","..KdssDDDDDDSWWSSDDDDDssdK..","..KdssDDDDDDDWWSDDDDDDssdK..","..KdssDDDDDDWSSWSDDDDDssdK..","..KdssDggDDWSSDSWSDDggssdK..","...KssDgggWSSDDDSWSgggssK...","...KdssDbbgSDDDDDSGbbssdK...","...KdssbbbggDDDDDggbbbsdK...","....KdbbbSgggDDDgggSbbbK....",".....KRbSsDgggDgggssSRbK....","......KdssssggsggsssdKK.....",".......KddssssssssddK.......","........KKKddddddKKK........","...........KKKKKK...........","............................","............................"]},"node_elite":{"w":28,"h":28,"p":{"K":"#0c121a","G":"#ffe27a","g":"#dca338","r":"#b82828","m":"#6e161b","f":"#ffd954","P":"#e8d4a6","n":"#bfa574"},"r":["............................","...KK..................KK...","..KggK................KggK..","..KgGgK..............KggGK..",".KgggGgK............KggGggK.",".KggggGgK..........KggGgggK.","..KgggGggK........KgggGggK..","...KgggGggKKKKKKKKgggGggK...","...KggggggggggggggggggggK...","....KgGGGGGGGGGGGGGGGGGK....","....KggmmmmmmmmmmmmmmggK....","....KggmrrrrrrrrrrrrmggK....","....KggmrrPPPPPPPPrrmggK....","....KggmrrPPPPPPPPrrmggK....","....KggmrrPfKPPKfPrrmggK....","....KggmrrPKKPPKKPrrmggK....","....KggmrrPPPPPPPPrrmggK....","....KggmrrPnnKKnnPrrmggK....","....KgggmrrnnnnnnrrmgggK....",".....KgggmrnKnnKnrmgggK.....","......KKgggmrrrrmgggKK......","........KgggmrrmgggK........",".........KgggmmgggK.........","..........KKggggKK..........","............KggK............",".............KK.............","............................","............................"]},"node_event":{"w":28,"h":28,"p":{"K":"#0c121a","W":"#fff9e6","G":"#ffe27a","g":"#dca338","V":"#c4a6ff","v":"#785cc4","p":"#3e2c6b"},"r":["............................","............................",".......KKKKKKKKKKKKKK.......","......KvvvvvvvvvvvvvvK......",".....KvvvvvvvvvvvvvvvvK.....","....KvvvppppppppppppvvvK....","...KvvvppppppppppppppvvvK...","..KvvvppppGGGGGGGGppppvvvK..","..KvvpppVggWGGGGGGGVpppvvK..","..KvvppppggpppppGWGppppvvK..","..KvvppppggpppppGGGppppvvK..","..KvvpppppppppppGGGppppvvK..","..KvvppppppppGGGGGGppppvvK..","..KvvppppppppGGGGppppppvvK..","..KvvppppppppGGppppppppvvK..","..KvvppppppppGGppppppppvvK..","..KvvppppppppGGppppppppvvK..","..KvvppppppppppppppppppvvK..","..KvvppppppppppppppppppvvK..","..KvvpppVppppGGGpppVpppvvK..","..KvvvpppppppGWGppppppvvvK..","...KvvvppppppGGGpppppvvvK...","....KvvvppppppppppppvvvK....",".....KvvvvvvvvvvvvvvvvK.....","......KvvvvvvvvvvvvvvK......",".......KKKKKKKKKKKKKK.......","............................","............................"]},"node_shop":{"w":28,"h":28,"p":{"K":"#0c121a","W":"#fff9e6","G":"#ffe27a","g":"#dca338","o":"#996520","B":"#7d4f2c","b":"#54331b","u":"#361f10","R":"#f04e45","r":"#b82828"},"r":["............................","............................","............................","............................","......KKKKKKKKKKKKKKKK......",".....KGWWWWWWWWWWWWWWWK.....",".....KGRRRGGGRRRGGGRRRK.....","....KGGRRRGGGRRRGGGRRRGK....","....KGGRRRGGGRRRGGGRRRGK....","...KGGGRRRGGGRRRGGGRRRGGK...","...KGGGRRRGGGRRRGGGRRRGGK...","..KGGGGRRRGGGRRRGGGRRRGGGK..","..KGgggrrrgggrrrgggrrrGGGK..","...KgggrrrgggrrrgggrrruKK...","....KubbbbbboooobbbbbbuK....","....KubbbbbgooRogbbbbbuK....","....KubbbbgGGGGgggbbbbuK....","....KubbbbgGGGGgggbbbbuK....","....KubbbbggGGWgggbbbbuK....","....KubbbbggggggggbbbbuK....","....KubbbbbggggggbbbbbuK....","....KubbbbbbggggbbbbbbuK....","....KuBBBBBBBBBBBBBBBBuK....","....KuBBBBBBBBBBBBBBBBuK....","....KuuuuuuuuuuuuuuuuuuK....",".....KKKKKKKKKKKKKKKKKK.....","............................","............................"]},"node_camp_0":{"w":28,"h":28,"p":{"K":"#0c121a","W":"#fff9e6","G":"#ffe27a","B":"#7d4f2c","b":"#54331b","R":"#f04e45","F":"#ff9436","f":"#ffd954","T":"#a3a8ad","q":"#6e757a","Z":"#241e18"},"r":["............................","...............K............","..............KGK...........","............KK.K............","..........KKRRKKK...........","........KKfZRRRZZKKK........",".......KZZZZFFRRZZZFK.......","......KZZZZRFFFRRZZZZK......",".....KZZZZRFFFFRRRZZZZK.....","....KZZZZZRFFFFFRRRZZZZK....","...KZZZZZRRFFffFFRRZZZZZK...","...KZZZZRRFFFffFFRRRZZZZK...","..KZZZZZRRFFffffFFRRZZZZZK..","..KZZZZZRRFFffffFFRRZZZZZK..","..KZZZZZRRFFffffFFRRZZZZZK..","..KZZZZZRRFFfWWfFFRRZZZZZK..","..KZZZZZRRFFfWWfFFRRZZZZZK..","..KZZZZZRRFFfWWfFFRRbZZZZK..","...KZZZZZBBBBBBbbbbbbZZZK...","...KZZZZZZZBBBBBBbbZZZZZK...","....KZTqqZbbbbBBBBBBTqqK....",".....KqqbbbbbbZZBBBBBBqK....",".....KqqbbbqZZZZZTqBBBqK....","......KKZqqqZTqqZqqqKKK.....","........KqqqZqqqZqqqK.......",".........KKKKqqqKKKK........",".............KKK............","............................"]},"node_camp_1":{"w":28,"h":28,"p":{"K":"#0c121a","W":"#fff9e6","G":"#ffe27a","B":"#7d4f2c","b":"#54331b","R":"#f04e45","F":"#ff9436","f":"#ffd954","T":"#a3a8ad","q":"#6e757a","Z":"#241e18"},"r":["............................","............K...............","...........KGK..............",".........K..K.KK............","........KFKKKKRRK...K.......","........KKKZZRRRZKKKfK......",".......KZZZZRRFFRZZZK.......","......KZZZZRRFFFRZZZZK......",".....KZZZZRRRFFFFRZZZZK.....","....KZZZZZRRFFFFFRRZZZZK....","...KZZZZZRRFFffFFRRZZZZZK...","...KZZZZRRRFFffFFFRRZZZZK...","..KZZZZZRRFFffffFFRRZZZZZK..","..KZZZZZRRFFffffFFRRZZZZZK..","..KZZZZZRRFFffffFFRRZZZZZK..","..KZZZZZRRFFfWWfFFRRZZZZZK..","..KZZZZZRRFFfWWfFFRRZZZZZK..","..KZZZZZRRFFfWWfFFRRbZZZZK..","...KZZZZZBBBBBBbbbbbbZZZK...","...KZZZZZZZBBBBBBbbZZZZZK...","....KZTqqZbbbbBBBBBBTqqK....",".....KqqbbbbbbZZBBBBBBqK....",".....KqqbbbqZZZZZTqBBBqK....","......KKZqqqZTqqZqqqKKK.....","........KqqqZqqqZqqqK.......",".........KKKKqqqKKKK........",".............KKK............","............................"]},"node_boss":{"w":40,"h":40,"p":{"K":"#0c121a","W":"#fff9e6","G":"#ffe27a","g":"#dca338","o":"#996520","b":"#54331b","u":"#361f10","R":"#f04e45","m":"#6e161b","f":"#ffd954","L":"#79c958","C":"#9af5ff","c":"#46b8e0","H":"#ff7d8a"},"r":["........................................","...................KK...................","..................KggK..................",".................KggWGK.................","........K........KggGGK........K........",".......KgK......KgggGGgK......KgK.......",".......KgWK....KggggGGggK....KgWK.......",".....KKKgggKK.KgggggGGgggK.KKgggKKK.....","....KbbKgggggKKgggggGGgggKKgggggKbbK....","....KbggKggggggggggWLGgggggggggKKggK....","...KbbggKggggHRggggLLGgggCcggggKbggbK...","..KbbgggbggggRRggggLLGgggccggggbbgggbK..","..KbbggbbgggggggggggGGgggggggggbbbggbK..",".KbbgggbgggGGGGGGGGGGGGGGGGGGGggbbgggbK.",".KbbggbbggggggggggggggggggggggggbbbggbK.",".KbbggbbgguuuuuuuuuuuuuuuuuuuuggbbbggbK.",".KbbbbbbgguWbbbbbbbbbbbbbbbbWuggbbbbbbK.","..KbbbbbggubbbbbbboooobbbbbbbuggbbbbbK..","..KbbbbbggubbbbboooooooobbbbbuggbbbbbK..","..KbbbbbggubbbbooommmmooobbbbuggbbbbbK..","..KbbbbbggubbbboommmmmmoobbbbuggbbbbbK..","...KbbbbbggubboofWfmmfWfoobbuggbbbbbK...","...KbbbbbggubboofffmmfffoobbuggbbbbbK...","...KbbbbbggubboommmmmmmmoobbuggbbbbbK...","....KKbbbggubboommmmmmmmoobbuggbbbKK....","......KKbggubbboommmmmmoobbbuggbKK......","........KggubbbooGGGGGGoobbbuggK........","........KgguubbbooGGGGoobbbuuggK........","........KggguubbbboGGobbbbuugggK........",".........KggguubbbbbbbbbbuugggK.........","..........KggguuubbbbbbuuugggK..........","...........KKggguubbbbuugggKK...........",".............KggguubbuugggK.............","..............KggguuuugggK..............","...............KggguWgggK...............","................KKggggKK................","..................KggK..................","...................KK...................","........................................","........................................"]},"node_check":{"w":16,"h":16,"p":{"K":"#0c121a","W":"#fff9e6","G":"#ffe27a","O":"#5c3a12","u":"#361f10"},"r":["................","......KKKK......","....KKOOOOKK....","...KOOuuuuOOKK..","..KOuuuuuuuuWGK.","..KOuuuuuuuWGGK.",".KOuuuuuuuWGGOK.",".KOuuuuuuuWGGOK.",".KOuWGuuuWGGuOK.",".KOuGWGuWGGuuOK.","..KOuGWWGGuuOK..","..KOuuGWGGuuOK..","...KOOuGGuOOK...","....KKOOOOKK....","......KKKK......","................"]},"node_ptr":{"w":12,"h":10,"p":{"K":"#0c121a","W":"#fff9e6","G":"#ffe27a","g":"#dca338"},"r":[".KKKKKKKKKK.","KggggggggggK",".KgWWWWWWgK.",".KggGGGGggK.","..KgGGGGgK..","...KgGGgK...","...KggggK...","....KggK....",".....KK.....","............"]},"vineL":{"w":26,"h":40,"p":{"K":"#0c121a","R":"#f04e45","r":"#b82828","L":"#79c958","l":"#48913b","e":"#27592a","H":"#ff7d8a"},"r":["...............KKKK.......","..............KllllK......",".............KlllLllK.....",".........KKKKKllllllKKKK..","........KllllKKlllllllleK.",".......KlllLllKlelleeeeeK.",".......KlllrrlreeeeeKKKK..","........KlrrRRrrKKKK......",".........KrRHRRrK.........","...KKKK..KrRRRRrK.........","..KllllKKlrrRRrrK.........",".KlllLllKlerrrrK..........",".KlllllllelllLllK.........","..KllllKlellllllK.........","...KKKKleeKllllK..........","......KleK.KKKK...........",".KKKKKrrlrK...............","KllllrrRRrrK..............","lllLlrRHRRrK..............","lllllrRRRRrKK.............","KllllrrRRrrllK............",".KKKKKrrrrlLllK...........",".....KlellllllK...........","..KKKKleKllllK............",".KlllleleKKKK.............","KlllLllleK................","KllllllleKKKKKKK..........",".KllllKleKrrlrllK.........","..KKKKKelrrRRrrllK........",".......KlrRHRRrllK........","......KllrRRRRrlK.........",".....KlllrrRRrrK..........",".....KllllrrrrKKKK........","......KllllelellllK.......",".......KKKKKelllLllK......","............KlllllleKK....",".............KllllelleK...","..............KKKKKeeeK...","...................KKK....",".........................."]},"vineR":{"w":26,"h":40,"p":{"K":"#0c121a","R":"#f04e45","r":"#b82828","L":"#79c958","l":"#48913b","e":"#27592a","H":"#ff7d8a"},"r":[".......KKKK...............","......KllllK..............",".....KllLlllK.............","..KKKKllllllKKKKK.........",".KellllllllKKllllK........",".KeeeeellelKllLlllK.......","..KKKKeeeeerlrrlllK.......","......KKKKrrRRrrlK........",".........KrRRHRrK.........",".........KrRRRRrK..KKKK...",".........KrrRRrrlKKllllK..","..........KrrrrelKllLlllK.",".........KllLlllelllllllK.",".........KllllllelKllllK..","..........KllllKeelKKKK...","...........KKKK.KelK......","...............KrlrrKKKKK.","..............KrrRRrrllllK","..............KrRRHRrlLlll",".............KKrRRRRrlllll","............KllrrRRrrllllK","...........KllLlrrrrKKKKK.","...........KllllllelK.....","............KllllKelKKKK..",".............KKKKelellllK.","................KelllLlllK","..........KKKKKKKelllllllK",".........KllrlrrKelKllllK.","........KllrrRRrrleKKKKK..","........KllrRRHRrlK.......",".........KlrRRRRrllK......","..........KrrRRrrlllK.....","........KKKKrrrrllllK.....",".......KllllelellllK......","......KllLllleKKKKK.......","....KKellllllK............","...KellellllK.............","...KeeeKKKKK..............","....KKK...................",".........................."]},"gemTriad":{"w":44,"h":18,"p":{"K":"#0c121a","W":"#fff9e6","G":"#ffe27a","g":"#dca338","o":"#996520","R":"#f04e45","m":"#6e161b","L":"#79c958","e":"#27592a","C":"#9af5ff","c":"#46b8e0","a":"#236e9e","H":"#ff7d8a"},"r":["............................................","....................KKKK....................","................KKKKooooKKKK................","............KKKKooooggggooooKKKK............",".........KKKooooggggggggggggooooKKK.........","........KooogggggggggeegggggggggoooK........","........KoggGGGGGGGGeLLeGGGGGGGGGgoK........",".......KoggggggggggeLLLLeggggggggggoK.......","......KooggmmmmmggeLLWLLLeggaaaaaggooK......","......KogggmHRRmggeLLLLLLeggaCccagggoK......",".....KoggggmRRRmgggeLLLLegggacccaggggoK.....","....KooggggmRRRmggggeLLeggggacccaggggooK....","....KogggggmmmmmggggeeeeggggaaaaagggggoK....","...KoooooooooooooooooeeoooooooooooooooooK...","....KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK....","............................................","............................................","............................................"]},"icon_camp_heal":{"w":28,"h":28,"p":{"K":"#0c121a","W":"#fff9e6","B":"#7d4f2c","b":"#54331b","R":"#f04e45","r":"#b82828","F":"#ff9436","f":"#ffd954","n":"#bfa574","H":"#ff7d8a","Z":"#241e18"},"r":["............................",".KKKKKKKKKKKKKKKKKKKKKKKKKK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZRRZRRZZZK.",".KZZZZZZZZZZZZZZZRHWRRRRZZK.",".KZZZZZZZZZZZZZZZRRRRRRRZZK.",".KZZZZZZZrrrrZZZnnRRRRRZZZK.",".KZZZZZZrrRRrrnnZZZRRrZZZZK.",".KZZZZZZrRHRRrZZZZZZrZZZZZK.",".KZZZZZZrRRRRrZZZZZZZZZZZZK.",".KZZZZZRrrRRrrZZZZZZZZZZZZK.",".KZZZZnnFrrrrZZZZZZZZZZZZZK.",".KZZnnRRFFRRZZZZZZZZZZZZZZK.",".KZZZZRRFFRRZZZZZZZZZZZZZZK.",".KZZZZRRFFRRZZZZZZZZZZZZZZK.",".KZZZZRFffFRZZZZZZZZZZZZZZK.",".KZZZZRFffFRZZZZZZZZZZZZZZK.",".KZZZBRFffFRbbbZZZZZZZZZZZK.",".KZZZBBBBBbbbbbZZZZZZZZZZZK.",".KZZZZZBBBBBBZZZZZZZZZZZZZK.",".KZZZbbbbBBBBBBZZZZZZZZZZZK.",".KZZZbbbZZZZBBBZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KKKKKKKKKKKKKKKKKKKKKKKKKK.","............................"]},"icon_camp_carve":{"w":28,"h":28,"p":{"K":"#0c121a","W":"#fff9e6","S":"#a9bac9","g":"#dca338","B":"#7d4f2c","C":"#9af5ff","c":"#46b8e0","a":"#236e9e","Z":"#241e18"},"r":["............................",".KKKKKKKKKKKKKKKKKKKKKKKKKK.",".KZZZZZZZZZZZZZZZZZZZZZZBBK.",".KZZZZZZZZZZZZZZZZZZZZZBBBK.",".KZZZZZZZZZZZZZZZZZZZZgBBBK.",".KZZZZZZZZZZZZZZZZZZZBBBBBK.",".KZZZZZZZZZZCZZZZZZZBBBBBZK.",".KZZZZZZZZZZZZWZZZZBBBBBZZK.",".KZZZZZZZZZZZaaZZZWBBBBZZZK.",".KZZZZCZZZZaaaaZZWSBBBZZZZK.",".KZZZZZZZaaaCCCZWSSZZZZZZZK.",".KZZZZZaaaCCCCCWSCZZZZZZZZK.",".KZZZZZacCCCCcWSSZZZZZZZZZK.",".KZZZZZacCWccWSSZZZZZZZZZZK.",".KZZZZZacccccSSaZZWZZZZZZZK.",".KZZZZaaccccccaaZZZZZZZZZZK.",".KZZZZaaccccccaaZZZZZZZZZZK.",".KZZZZacccccccaaZZZZZZZZZZK.",".KZZZaaccccccaaaZZZZZZZZZZK.",".KZZZaacccccaaaZZZZZZZZZZZK.",".KZZZaacccccaaZZZZZZZZZZZZK.",".KZZZaaacccaaaZZZZZZZZZZZZK.",".KZZZZaaaaaaaZZZZZZZZZZZZZK.",".KZZZZZZZaaaZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KKKKKKKKKKKKKKKKKKKKKKKKKK.","............................"]},"icon_camp_purge":{"w":28,"h":28,"p":{"K":"#0c121a","W":"#fff9e6","G":"#ffe27a","B":"#7d4f2c","b":"#54331b","u":"#361f10","R":"#f04e45","F":"#ff9436","f":"#ffd954","P":"#e8d4a6","n":"#bfa574","Z":"#241e18"},"r":["............................",".KKKKKKKKKKKKKKKKKKKKKKKKKK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZRRZZZZZZK.",".KZZZZZZZZZZZZZZfZRRZZZZZZK.",".KZZZZZZZZZZZZZZZRRRRnnFZZK.",".KZZZZZZZZZZZZZZnRRRRnnZZZK.",".KZZZZZZZZZZZZnnRRFFRRnZZZK.",".KZZZZZZZZZZZZnPRRFFRRRZZZK.",".KZZZZZZZZZZZZnRRFFFFRRZZZK.",".KZZuuuuuuuuuuRRRFFFFRRRZZK.",".KZZuBBBBBBBBuRRFFFFFFRRZZK.",".KZZuBBBBBBBBRRFFFffFFFRZZK.",".KZZuuuuGGuuRRRFFFffFFFRRZK.",".KZZbBBBGGBBRRRFFFffFFFRRZK.",".KZZbBBBBBBBRRRFFFffFFFRRZK.",".KZZbBBBBBBBRRRFFFffFFFRRZK.",".KZZbBBBBBBBRRRFFffWfFFRRZK.",".KZZbBBBBBBBRRRFFffffFFRZZK.",".KZZbBBBBBBBRRRFFffffFFRZZK.",".KZZbbbbbbbbRRRFFffffFFRZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KKKKKKKKKKKKKKKKKKKKKKKKKK.","............................"]},"icon_shop_potion":{"w":28,"h":28,"p":{"K":"#0c121a","W":"#fff9e6","w":"#dfe6ec","S":"#a9bac9","D":"#272f38","g":"#dca338","B":"#7d4f2c","R":"#f04e45","r":"#b82828","L":"#79c958","l":"#48913b","n":"#bfa574","H":"#ff7d8a","Z":"#241e18"},"r":["............................",".KKKKKKKKKKKKKKKKKKKKKKKKKK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZnnnnZZZZZZZZZZK.",".KZZZZZZZZZZBBBBZZZZZZZZZZK.",".KZZZZZZZZZZBBBBZZZZZZZZZZK.",".KZZZZZZZZZwwwwwwZZZZZZZZZK.",".KZZZZZZZZZwwwwwwZZZZZZZZZK.",".KZZZZZZZZZZSSSSllLlZZZZZZK.",".KZZZZZZZZZZSSSgllllZZZZZZK.",".KZZZZZZZZZSSSSSSZZZZZZZZZK.",".KZZZZZZZSSDDDDDDSSZZZZZZZK.",".KZZZZZZSDDDDDDDDDDSZZZZZZK.",".KZZZZZSDDWrrrrrrDDDSZZZZZK.",".KZZZZZSDWrrrrrrrrDDSZZZZZK.",".KZZZZSDDWHHHHHHHHHDDSZZZZK.",".KZZZZSDrWRRRRRRRRRrDSZZZZK.",".KZZZZSDrWRRRRRRRRRrDSZZZZK.",".KZZZZSDrWRRRRRRRRRrDSZZZZK.",".KZZZZZSrRRRRRRRRRRrSZZZZZK.",".KZZZZZSDrrrrrrrrrrDSZZZZZK.",".KZZZZZZSDrrrrrrrrDSZZZZZZK.",".KZZZZZZZSSrrrrrrSSZZZZZZZK.",".KZZZZZZZZZSSSSSSZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KKKKKKKKKKKKKKKKKKKKKKKKKK.","............................"]},"icon_shop_carve":{"w":28,"h":28,"p":{"K":"#0c121a","W":"#fff9e6","S":"#a9bac9","G":"#ffe27a","g":"#dca338","C":"#9af5ff","c":"#46b8e0","a":"#236e9e","T":"#a3a8ad","q":"#6e757a","Q":"#444b50","Z":"#241e18"},"r":["............................",".KKKKKKKKKKKKKKKKKKKKKKKKKK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZGGK.",".KZZZZZZZZZZZZZZZZZZZZZGGGK.",".KZZZZZZZZZZZZZZZZZZZZGGGZK.",".KZZZZZZZZZZZZZZZZZZZGGGZZK.",".KZZZZZZZggggggggggZSGGZZZK.",".KZZZZZZZgaaaaaaaagSSSZZZZK.",".KZZZZZZZgaccccccaSSSZZZZZK.",".KZZZZZZZgacccCcWSSSZZZZZZK.",".KZZZZZZZgaccCWccSSZZZZZZZK.",".KZZZZZZZgaccccccagZZZZZZZK.",".KZZZZZZZgaccccccagZZZZZZZK.",".KZZZZZZZgaaaaaaaagZZZZZZZK.",".KZZZZZZZggggggggggZZZZZZZK.",".KZZggWWWWWWWWWWWWWWWWggZZK.",".KZZggTTTTTTTTTTTTTTTTggZZK.",".KZZggTTTTTTTTTTTTTTTTggZZK.",".KZZggTTTTTTTTTTTTTTTTggZZK.",".KZZZZZqqqqqqqqqqqqqqZZZZZK.",".KZZZZZqqqqqqqqqqqqqqZZZZZK.",".KZZZZQQQQQQQQQQQQQQQQZZZZK.",".KZZZZQQQQQQQQQQQQQQQQZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KKKKKKKKKKKKKKKKKKKKKKKKKK.","............................"]},"icon_gate_retreat":{"w":28,"h":28,"p":{"K":"#0c121a","W":"#fff9e6","G":"#ffe27a","g":"#dca338","B":"#7d4f2c","b":"#54331b","R":"#f04e45","P":"#e8d4a6","n":"#bfa574","N":"#8a724a","Z":"#241e18"},"r":["............................",".KKKKKKKKKKKKKKKKKKKKKKKKKK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZBBBBBBBBBBBZZZK.",".KZZZZZZZZBBBnnnnnnnnnnZZZK.",".KZZZZZZZZBBPBBBBBBBBBBZZZK.",".KZZZZZZZZZWggBBBBBBBBBZZZK.",".KZZZZZZZGgggggBBBBBBBBZZZK.",".KZZZZZZZggggggZZZZbbZZZZZK.",".KZZZZZZRRRRRRZZZZZbbZZZZZK.",".KZZZZZZRRRRRRZZZZZbbZZZZZK.",".KZZZZnnnnnnnnNZZZZbbZZZZZK.",".KZZZnnnnnnnnnnNZZZbbZZZZZK.",".KZZZnnnnnnnnnnNNZZbbZZZZZK.",".KZZZnnnnnnnnnnNNZZbbZZZZZK.",".KZZZnnnnnnnnnnNNZZbbZZZZZK.",".KZZZNnnnnnnnnNNNZZbbZZZZZK.",".KZZZZNNnnnnNNNNZGggbZZZZZK.",".KZZZZZNNNNNNNNGWgggbZZZZZK.",".KZZZZZZNNNNNNZgGggbbZZZZZK.",".KZZZZZZZZZZZZZZgggZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KKKKKKKKKKKKKKKKKKKKKKKKKK.","............................"]},"icon_gate_advance":{"w":28,"h":28,"p":{"K":"#0c121a","W":"#fff9e6","S":"#a9bac9","G":"#ffe27a","g":"#dca338","b":"#54331b","l":"#48913b","e":"#27592a","M":"#68b891","T":"#a3a8ad","q":"#6e757a","Z":"#241e18"},"r":["............................",".KKKKKKKKKKKKKKKKKKKKKKKKKK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZeeeeeeeeZZZZZZZZK.",".KZZZZZeeeelllllleeeeZZZZZK.",".KZZZZeeellllWSlllleeeZZZZK.",".KZZZeeelllllWSllllleeeZZZK.",".KZZeeellllllWSlllllleeeZZK.",".KZZeeellllllWSlllllleeeZZK.",".KZZeeeelllllWSllllleeeeZZK.",".KZMMMMMqllllWSllllqMMMMMZK.",".KZMMMMMqeellWSlleeqMMMMMZK.",".KZqlTTTqeeeeWSeeeeqTTTlqZK.",".KZqTTTTqeeeeWSeeeeqTTTTqZK.",".KZqTTTTqZeeeWSeeeZqTTTTqZK.",".KZqTTTTqZZZZWSZZZZqTTTTqZK.",".KZqTTTTqZZZZWSZZZZqTTTTqZK.",".KZqTTTTqZZZZWSZZZZqTTTTqZK.",".KZqTTTTqZgGggggGgZqTTTTqZK.",".KZqTTTTqZggggggggZqTTTTqZK.",".KZqTTTTqZZZZbbZZZZqTTTTqZK.",".KZqTTTTqZZZZbbZZZZqTTTTqZK.",".KZqTTTTqZZZZbbZZZZqTTTTqZK.",".KZqqqqqqZZZZGGZZZZqqqqqqZK.",".KZZZZZZZZZZZGGZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KKKKKKKKKKKKKKKKKKKKKKKKKK.","............................"]},"icon_event_wood":{"w":28,"h":28,"p":{"K":"#0c121a","B":"#7d4f2c","b":"#54331b","u":"#361f10","R":"#f04e45","r":"#b82828","L":"#79c958","l":"#48913b","M":"#68b891","H":"#ff7d8a","Z":"#241e18"},"r":["............................",".KKKKKKKKKKKKKKKKKKKKKKKKKK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZbbBBBBBBBBBBbbZZZZZK.",".KZZZZZbbBBBBBBBBBBbbZZZZZK.",".KZZZZZbbBBBBBBBBBBbbZZZZZK.",".KZZZZZlLlBBBuuBBBBbbZZZZZK.",".KZZZZZlllBBuuuuBBBbbZZZZZK.",".KZZZZZlllBBuKKuBBBbbZZZZZK.",".KZZZZZbbBBuKKKKuBBbbZZZZZK.",".KZZZZZbbBBuKRRKuBBbbZZZZZK.",".KZZZZZbbBBuKHRKuBBbbZZZZZK.",".KZZZZZbbBBuKRRKuBBbbZZZZZK.",".KZZZZZbbBBuKRRKuBBMMZZZZZK.",".KZZZZZbbBBuKRRKuBBMMZZZZZK.",".KZZZZZbbBBBuRRuBBBMMZZZZZK.",".KZZZZZbbBBBuRRuBBBbbZZZZZK.",".KZZZZZbbBBBBRRBBBBbbZZZZZK.",".KZZZZZbbBBBRHRRBBBbbZZZZZK.",".KZZZZZbbBBBRRRRBBBbbZZZZZK.",".KZZZZZbbBBrrrrrrBBbbZZZZZK.",".KZZZZZbbBrrrrrrrrBbbZZZZZK.",".KZZZZbbbBrrRRRRrrBbbbbZZZK.",".KZZbbbbbZZrrrrrrZZZbbbbbZK.",".KZZbbbZZZZZZZZZZZZZZZbbbZK.",".KKKKKKKKKKKKKKKKKKKKKKKKKK.","............................"]},"icon_event_stele":{"w":28,"h":28,"p":{"K":"#0c121a","W":"#fff9e6","L":"#79c958","l":"#48913b","M":"#68b891","t":"#3a7a62","C":"#9af5ff","c":"#46b8e0","a":"#236e9e","T":"#a3a8ad","q":"#6e757a","Q":"#444b50","Z":"#241e18"},"r":["............................",".KKKKKKKKKKKKKKKKKKKKKKKKKK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZqqZZZZZZZZZZZK.",".KZZZZZZZZZqqqqqqZZZZZZZZZK.",".KZZZZZZZlLllTTqqqqZZZZZZZK.",".KZZZZZZqllllTTTTqqqZZZZZZK.",".KZZZZZZqllllTTTTTqqZZZZZZK.",".KZZZZZZqMTTTaaTTTqqZZZZZZK.",".KZZZZZZqqTTTccTTTqqZZZZZZK.",".KZZZZZZqqTTaccaTTqqZZZZZZK.",".KZZZZZZqqTacCWcaTqqZZZZZZK.",".KZZZZZZqqTaccccaTqqZZZZZZK.",".KZZZZZZqqTaccccaTqqZZZZZZK.",".KZZZZZZqqTaccccaTqqZZZZZZK.",".KZZZZZZqqTTaccaTTqqZZZZZZK.",".KZZZZZZqqTTTccTTtltZZZZZZK.",".KZZZZZZqqTTTaaTTtttZZZZZZK.",".KZZZZZZqqTTTTTTTtttZZZZZZK.",".KZZZZZZqqTQTTTTQtttZZZZZZK.",".KZZZZZZqqTTTTTTTTqqZZZZZZK.",".KZZZZQQQQQQQQQQQQQQQQZZZZK.",".KZZZZQQQQQQQQQQQQQQQQZZZZK.",".KZZZZQQQQQQQQQQQQQQQQZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KKKKKKKKKKKKKKKKKKKKKKKKKK.","............................"]},"icon_event_pool":{"w":28,"h":28,"p":{"K":"#0c121a","W":"#fff9e6","G":"#ffe27a","g":"#dca338","L":"#79c958","l":"#48913b","t":"#3a7a62","C":"#9af5ff","c":"#46b8e0","a":"#236e9e","T":"#a3a8ad","q":"#6e757a","Z":"#241e18"},"r":["............................",".KKKKKKKKKKKKKKKKKKKKKKKKKK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZlZZZZZZZZZZZZZZZLZZZK.",".KZZZZlZZLZZZZZZZZZZZZLZZZK.",".KZZZZZlZLZZZZZZZZZZZLZZZZK.",".KZZZZZlLZZZZZZZZZZZZLZZZZK.",".KZZZZZZZZttttttttZqTqqZZZK.",".KZZZqTqqtaaaaaaaatqqqqZZZK.",".KZZZqqqqaaaaaaaaaaqqqqZZZK.",".KZZZqqqqaaccccccaaaattZZZK.",".KZZZtaaaCCCCCcccccaaatZZZK.",".KZZtaaaccccGggcccccaaatZZK.",".KZZtaacccccgggcCCCCCaatZZK.",".KZZtaacccGggccccccccaatZZK.",".KZZtaaaccgggccWggccaaatZZK.",".KZZZtaaaccccccgggcaaatZZZK.",".KZZZttaaaWWWWWccaaaattZZZK.",".KZZZZttaaaaaaaaaaaattZZZZK.",".KZZZZZZttaaaaaaaattZZZZZZK.",".KZZZZZZZZttttttttZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KKKKKKKKKKKKKKKKKKKKKKKKKK.","............................"]},"icon_event_bag":{"w":28,"h":28,"p":{"K":"#0c121a","W":"#fff9e6","G":"#ffe27a","o":"#996520","B":"#7d4f2c","b":"#54331b","u":"#361f10","L":"#79c958","l":"#48913b","n":"#bfa574","Z":"#241e18"},"r":["............................",".KKKKKKKKKKKKKKKKKKKKKKKKKK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZZZZZZZZZZZZZZZZZZK.",".KZZZZZZZBBZZZZZZZZBBZZZZZK.",".KZZZZZZBBBuuuuuBBbBBZZZZZK.",".KZZZZZlLluBBBBBBBbBBBZZZZK.",".KZZZZZlllBBBBBBBBbbBBZZZZK.",".KZZZZBBBBBBBBBBBBbbBBBZZZK.",".KZZZuBBBBBKKKKKKuubbBBZZZK.",".KZZZBBBbKKKKKKKKKKbbBBBZZK.",".KZZuBBbKKKKKKKKKKKKbbBBZZK.",".KZZuuubKnnnnnnnnnnKbbBBZZK.",".KZZuubKKnnnnnnnnnnKKbbbZZK.",".KZZuubKKonnnnnnnnoKKbbbZZK.",".KZZuubKKonnnWGnnnoKKbbbZZK.",".KZZubbKKoBBBGGBBBoKKbbbZZK.",".KZZZbbbKoBBBBBBBBoKubbbbZK.",".KZZZbbbKoBBBBBBBBoKubbbbZK.",".KZZZbbbuoooooooooouuubbbZK.",".KZZbbbbuuuKKKKKKuuuuZbbbbK.",".KZZbbbbuuuuuuuuuuuuZZbbbbK.",".KZZbbbZZZZuuuuuuZZZZZZbbbK.",".KZZbbbZZZZZZZZZZZZZZZZbbbK.",".KKKKKKKKKKKKKKKKKKKKKKKKKK.","............................"]},"crest_victory":{"w":90,"h":36,"p":{"K":"#0c121a","W":"#fff9e6","G":"#ffe27a","g":"#dca338","o":"#996520","b":"#54331b","u":"#361f10","R":"#f04e45","r":"#b82828","m":"#6e161b","L":"#79c958","l":"#48913b","e":"#27592a","C":"#9af5ff","c":"#46b8e0","H":"#ff7d8a"},"r":["..........................................................................................","..........................................................................................","...............KKKK....................................................KKKK...............","..............KllllK.........................K........................KllllK..............",".............KlllLllK.......................KWK......................KlllLllK.............",".............KllllllK......................KggK......................KllllllK.............","..............KllllK.....................KKggggKK.....................KllllK..............","...............KKKKK..................KKKooggggooKKK..................KKKKKK..............","...........KKKKKllllK.........K.....KKooooggGGggooooKK......K........KlllleeKKK...........","..........KlllllllLllK.......KWK...KoooooggGGGGggoooooK....KWK......KlllLllllllK..........",".........KlllLlllllllK.......KgK..KooogggggGGGGgggggoooK..KgK.......KllllllllLllK.........",".........KllllllllllK........KggKKooogggggGGGGGGgggggoooKKggK........KllllllllllK.........","..........KllllKKeeK.........KgggooggggggGGGGGGGGggggggoogggK.........KKKeellllK..........","...........KKKK.KeeeKKK......KgggGgggbggGGGGGGGGGGggbgggGgggK......KKKKKeeeKKKK...........",".................KellllK.....KgggGGgbbgGGGGGGGGGGGGgbbgGGgggK.....KllllKeeK...............","..............KKKKlllLllK....KgggGGGGggGGGGGGGGGGGGggGGGGgggK....KlllLlleeKK..............",".............KllllllllllK.....KggGGGGGGGGGGGGGGGGGGGGGGGGggK.....KllllllllllK.............","............KlllLllllllK.....KoggGGGGGGGGGGGGGGGGGGGGGGGGggoK.....KlllllllLllK............","............KlllllleeeK......KoggGGGGGGGGGGGGGGGGGGGGGGGGggoK......KKKellllllK............",".............KllllKKeeeKKKKK.KoggGGGGGGGGGGGGGGGGGGGGGGGGggoK.KKKK..KeeellllK.............","..............KKKK..KeeellllKKoggWWWWWWWWWWLWLLWWWWWWWWWWWgoKKllllKKeeeKKKKK..............","...............KKKKKKmelllLllKoggbbbHRRbbbbLLLLbbbbCccbbbggoKlllLlleeeKKKKK...............",".........KKKKKKmmmmmmggllllllKoggbbbRRRbbbbLLLLbbbbcccbbbggoKlllllleegmmmmmKKKKKK.........",".......KKmmmmmggggggllllllllK.KoobbbRRRbbbbLLLLbbbbcccbbbooK.KllllllllgggggggmmmmKK.......","......KmmmggggrrrrrlllLlleeeKKKoobbbbbbbbbbbbbbbbbbbbbbbbooK..KKelllLllrrrrrrggggmmK......",".......KKrrrrrrrrrrllllllmeeeeKoogggggggggggggggggggggggggoKKKeeellllllrrrrrrrrrrKK.......",".........KKmrrrrrrrrllllrmKeellloooggbbbbbuuuuuubbbbbggooollleeeerllllrrrrrrrrmKK.........","...........KmrrrrrrrrrrrrmKKlllLlooggggbbbbbbbbbbbbggggoollLlleKmrrrrrrrrrrrrmK...........","..........KmrrrrrrrrrrmmmmKKlllllloooggggbggggggbggggooollllllKKmmmmrrrrrrrrrrmK..........","..........KrrrrmmmmmmmKKKK..KlllleeooogggggGGGGgggggoooeellllK..KKKKmmmmmmmrrrrK..........",".........KmmmmKKKKKKKK.......KKKKKKeoooooggGGGGggoooooeeeKKKK.......KKKKKKKKmmmmK.........","..........KKKK.....................KKeooooggggggooooKeeKK...................KKKK..........",".....................................KKKKooooooooKKK.KK...................................",".........................................KKKKKKKK.........................................","..........................................................................................",".........................................................................................."]},"crest_retreat":{"w":90,"h":36,"p":{"K":"#0c121a","W":"#fff9e6","S":"#a9bac9","G":"#ffe27a","g":"#dca338","o":"#996520","O":"#5c3a12","u":"#361f10","R":"#f04e45","r":"#b82828","P":"#e8d4a6","n":"#bfa574","N":"#8a724a","H":"#ff7d8a"},"r":["..........................................................................................","..........................................................................................","..........................................................................................",".......................................................K..K...............................","......................................................KGKKGK..............................",".....................................................KGK..KGK.............................",".....................................................KGKKKKGK.............................",".................................KKKK..............KKKoGooGoKKK...........................","...................KKKKKKKKKKKKKKWGggKKKKKKKKKKKKKKooooooooooooKKKKKKKK...................",".................KKOOOOOOOOOOOgGgggggGggOOOOOOOOOOooooggggggooooOOOOOOOKK.................","...............KKOOOOOOOOOOOOOggggOOggggOOOOOOOOOoooggggggggggoooOOOOOOOOKK...............",".............KKOOOOOooooooooooogGgggGggoooooooooooogggPPPKPPgggoooooooOOOOOKK.............","...........KKOOOOOoooooooooooRRggggggggooooooooooogggPPnnnnPPRggooooooooOOOOOKK...........","..........KOOOOOooooouuuuuuuurrrrrrrrrruuuuuuuuoogggPnnnnnnnRHgggoouuoooooOOOOOK..........",".........KOOOOooooouuuuuuuuuNrrrrrrrrrrNuuuuuuuooggPnnnnnnnRRnPggoouuuuoooooOOOOK.........",".........KggggooouuuuuuuuuuNnnPPPPnnnnNNNuuuuuooggPPnnnnnnnRRnPPggoouuuuuooggggOK.........","........KgKOOogouuuuuuuuuuNnPPPPPPPPnnnNNNuuuuooggPnnnnnnnRRRnnPggoouuuuuugooOOgK.........",".......KgKKOOOoguuuuuuuuuNnPPPPPPPPPPnnnNNNuuuooggPnnnSSGGRRnnnPggoouuuuugooOOOKgK........",".......KgKKOOOogouuuuuuuuNnPPPPPPPPPPnnnNNNuuuooggKnnnSSGGRRnnnPKgoouuuuugooOOOKgK........",".......KgK.KGOOgoouuuuuuNnnPPPPPPPPPPnnnnNNNuuooggPnnSSSnnnnnnnPggoouuuuogoOOGKKgK........",".......KgK.KOOOgoouuuuuuNnnPPPPPPPPPPnnnnNNNuuooggPPnSSnnnnnnnPPggoouuuuogOOOOKKgK........","........KgKKKOgOooouuuuuNnnnPPPPPPPPnnnnnNNNuuuooggPnSSnnnnnnnPggoouuuuooogOOKKgK.........",".........KggggOOOooouuuuNnnnnnPPPPnnnnnnnNNNuuuoogggSSnnnnnnnPgggoouuuoooOOggggK..........","..........KKKKOOOooouuuuNNnnnnnnnnnnnnnnNNNNuuuoooggSPPnnnnPPgggooouuuoooOOOKKK...........",".............KOOOOooooooNNnnnnnnnnnnnnnnNNNNooooooogggPPPPPPgggoooooooooOOOOK.............",".............KOOOOoooooooNNnnnnnnnnnnnnNNNNooooooooogggggKggggooooooooooOOOOK.............","..............KOOOOOOOOOONNgGggnnnnnnnNNNNNOOOOOOOooooggggggooooOOOOOOOOOOOK..............","..............KOOOOOOOgGggNggggnnnnnNNNNNNOgGggOOOOooooooooooooOOOOOOOOOOOOK..............","...............KKKKKKKgggWGggNNNNNNNNNNNNKKggggKKKKKKKooooooKKKKKKKKKKKKKKK...............","......................KKKggggNNNNNNNNNNNK..KKKK.......KKKKKK..............................",".........................KKKKKKNNNNNNKKK..................................................","...............................KKKKKK.....................................................","..........................................................................................","..........................................................................................","..........................................................................................",".........................................................................................."]},"crest_defeat":{"w":90,"h":36,"p":{"K":"#0c121a","D":"#272f38","b":"#54331b","u":"#361f10","R":"#f04e45","r":"#b82828","m":"#6e161b","N":"#8a724a","T":"#a3a8ad","q":"#6e757a","Q":"#444b50","H":"#ff7d8a"},"r":["..........................................................................................","..........................................................................................","..........................................................................................","..........................................................................................","..........................................................................................","................................KKKKKKKKKKKKKKKKKKKKKKKKKK................................","...............................KQQQQQQQQQQQQQQQQKKQQQQQQQQK...............................","...............................KQQQQQQQQQQQQQQQKKKQQQQQQQQK...............................",".................K.............KQQTTTTTTTTTTTTTKKTTTTTTTQQK..............K................","................KbK............KQQqqqqqqqqqqqqKKKqqqqqqqQQK.............KbK...............",".................KbK...........KQQqqDDDDDDDDDDKKDDDDDDqqQQK............KbK................",".............K...KbK...........KQQqqDDDDDDDDDKKKDDDDDDqqQQK............KbK...K............","...........KKNK...KbK..........KQQqqDDDDrrDDDKKDDDDDDDqqQQK...........KbK...KNKKK.........","..........KuuuKKK..KbK...K.....KQQqqDDrrRRrrKKKDDmmDDDqqQQK......K...KbK...KKKuuuK........","..........KuuuuuuKKKKbK.KNK.....KQQqDDrRHRRrKKKmmrrmmDqQQK......KNK.KbK.KKKuuuuuuK........","...........KKuuuuuuuKbKK.K......KQQqqDrRRRRrDKKmrrRrmqqQQK.......K..KbKKuuuuuuuKK.........",".............KKKuuNuuubuKKK.....KQQqqDrRRRRrDKKmrrrrmqqQQK.......KKKbuuuNuuuKKK...........","................KKKuuuubuuuKKK..KQQqqDrRRRRrDDKmrrrrmqqQQK....KKKuubuuuuuKKK..............","...................KKKKuuuuuuuKKKQQqqDrRRRRrDDKmrrrrmqqQQK.KKKuuuuuuuKKKK.................",".......................KKKuuuuuuuQQqqDrrrRRrDDDmrrrrmqqQQKKuuuuuuuKKK.....................","..........................KKKuuuuQQqqqDrrrrrDDKmrrrmmqqQQuuuuuuKKK........................",".........KK..................KKKuQQQqqqDDrrrDDKmrrmmqqQQQuuuKKK.................KK........","........KuuKKKK.................KKQQQqqDDDrrDKKmrmDqqQQQKKKK................KKKKuuK.......",".........KKuuuuKKK...........KKKK.KuuuuuuDDrDKKmmDqqQQQK...KKKK..........KKKuuuuKK........","...........KKKKuuuKK...KKKKKKbbbbKKuubbbbbbbbuuuuuuQQQKKK.KbbbbKKKKKK..KKuuuKKKK..........","...............KKKuuKKKbbbbbbbbbbK.KKQQQuuuuubbbbbbbbuuuuKKbbbbbbbbbbKKuuKKK..............","..............KKKbbbbbbbbbbbbbKKK....KQQqqqKKKDqqquuuuuuuK.KKKbbbbbbbbbbbbbKKK............",".............KbbbbbbbNbbKKKKKK........KQQqqKKDDqqQQKKKKKK.....KKKKKKbNbbbbbbbbK...........",".............KbbbbKKKKKK.KKK...........KQQqqKDqqQQK..............KKKKKKKKKbbbbK...........","..............KKKK......KQQQK...........KQQqKqqQQK..............KQQQK.....KKKK............","....................KK..KQQQK............KQQKqQQK...............KQQQK.KK..................","...................KqqK..KKK..............KQQKQK.................KKK.KqqK.................","...................KqqK....................KQKK......................KqqK.................","....................KK......................KK........................KK..................","..........................................................................................",".........................................................................................."]}};

  var S = {
    inited: false,
    sp: Object.create(null),
    parchTile: null,
    marginL: null,
    marginR: null
  };

  function defaultMakeCanvas(w, h) {
    var c = global.document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function hexToRgba(hex) {
    var h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
    var r = parseInt(h.slice(0, 2), 16) || 0;
    var g = parseInt(h.slice(2, 4), 16) || 0;
    var b = parseInt(h.slice(4, 6), 16) || 0;
    var a = h.length >= 8 ? (parseInt(h.slice(6, 8), 16) & 255) : 255;
    return [r, g, b, a];
  }

  function bakeSprite(mk, def) {
    var w = def.w, h = def.h;
    var cv = mk(w, h);
    var ctx = cv.getContext('2d');
    var img = ctx.createImageData(w, h);
    var d = img.data;
    var pal = Object.create(null);
    var keys = Object.keys(def.p);
    for (var i = 0; i < keys.length; i++) {
      pal[keys[i]] = hexToRgba(def.p[keys[i]]);
    }
    var rows = def.r;
    for (var y = 0; y < h; y++) {
      var row = rows[y];
      for (var x = 0; x < w; x++) {
        var ch = row.charAt(x);
        if (ch === '.') continue;
        var col = pal[ch];
        if (!col) continue;
        var idx = (y * w + x) * 4;
        d[idx] = col[0];
        d[idx + 1] = col[1];
        d[idx + 2] = col[2];
        d[idx + 3] = col[3];
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  function hash2(x, y) {
    var n = (x * 374761393 + y * 668265263) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  function tileNoise(x, y, period, scale) {
    var gx = ((x / scale) % period + period) % period;
    var gy = ((y / scale) % period + period) % period;
    var x0 = Math.floor(gx), y0 = Math.floor(gy);
    var x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    var fx = gx - x0, fy = gy - y0;
    var a = hash2(x0, y0), b = hash2(x1, y0);
    var c = hash2(x0, y1), d = hash2(x1, y1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }

  function clampByte(v) {
    return v < 0 ? 0 : (v > 255 ? 255 : (v | 0));
  }

  function bakeParchmentTile(mk) {
    var w = 128, h = 128;
    var cv = mk(w, h);
    var ctx = cv.getContext('2d');
    var img = ctx.createImageData(w, h);
    var d = img.data;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        // Periodic multi-octave aged dark forest parchment
        var n1 = tileNoise(x, y, 8, 16) - 0.5;
        var n2 = tileNoise(x + 17, y + 31, 16, 8) - 0.5;
        var n3 = hash2(x, y) - 0.5;
        // Subtle woven paper grain
        var weave = (((x & 3) === 0 ? 2 : 0) + ((y & 3) === 1 ? -2 : 0));
        // Occasional warm foxing spots
        var stain = tileNoise(x + 5, y + 9, 4, 32) > 0.74 ? -6 : 0;
        var delta = n1 * 14 + n2 * 8 + n3 * 5 + weave + stain;

        var r = 61 + delta * 1.05;
        var g = 51 + delta * 0.92;
        var b = 38 + delta * 0.72;

        // Faint hand-inked cartographic survey grid (dashed every 64px)
        var onH = (y === 0 || y === 64) && ((x & 7) < 3);
        var onV = (x === 0 || x === 64) && ((y & 7) < 3);
        if (onH || onV) {
          r -= 8; g -= 7; b -= 5;
        }

        var idx = (y * w + x) * 4;
        d[idx] = clampByte(r);
        d[idx + 1] = clampByte(g);
        d[idx + 2] = clampByte(b);
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  function bakeMarginTile(mk, isRight) {
    var w = 28, h = 128;
    var cv = mk(w, h);
    var ctx = cv.getContext('2d');
    var img = ctx.createImageData(w, h);
    var d = img.data;
    for (var y = 0; y < h; y++) {
      // Deckled paper edge profile (periodic in 128)
      var scallop = Math.round(Math.sin(y * Math.PI * 2 / 32) * 1.1 + Math.cos(y * Math.PI * 2 / 16) * 0.8);
      var edgeX = 7 + scallop;
      for (var x = 0; x < w; x++) {
        var lx = isRight ? (w - 1 - x) : x;
        var r = 0, g = 0, b = 0, a = 0;

        if (lx <= 1) {
          // Outer ink border
          r = 14; g = 18; b = 22; a = 255;
        } else if (lx <= 5) {
          // Dark oak binding rail with subtle grain & brass tacks every 32px
          var gr = (hash2(lx, y) - 0.5) * 10;
          r = 56 + gr; g = 37 + gr * 0.7; b = 23 + gr * 0.5; a = 255;
          if (lx === 3) { r += 16; g += 11; b += 7; }
          if ((y % 32) >= 14 && (y % 32) <= 16 && lx >= 2 && lx <= 4) {
            r = 210; g = 160; b = 68;
            if ((y % 32) === 14 && lx === 3) { r = 252; g = 228; b = 138; }
          }
        } else if (lx < edgeX) {
          // Deep scroll crease
          r = 22; g = 18; b = 14; a = 255;
        } else if (lx === edgeX) {
          // Deckled dark-sepia rim
          r = 34; g = 27; b = 19; a = 255;
        } else {
          // Curled parchment margin shading + distance ruler ticks
          var curl = lx - edgeX;
          var shade = curl < 5 ? (-16 + curl * 3) : (curl < 10 ? 4 : 0);
          var grain = (hash2(lx + 11, y) - 0.5) * 6;
          r = 58 + shade + grain;
          g = 48 + shade * 0.9 + grain;
          b = 36 + shade * 0.7 + grain;
          a = 255;
          // Stitched inner border line at lx = 15
          if (lx === 15 && (y % 6) < 4) {
            r = 86; g = 71; b = 49;
          }
          // Cartographic distance ticks pointing inward
          if ((y % 32) === 0 && lx >= 17 && lx <= 24) {
            r = 98; g = 82; b = 56;
          } else if ((y % 16) === 0 && lx >= 17 && lx <= 21) {
            r = 82; g = 68; b = 47;
          }
        }

        var idx = (y * w + x) * 4;
        d[idx] = clampByte(r);
        d[idx + 1] = clampByte(g);
        d[idx + 2] = clampByte(b);
        d[idx + 3] = clampByte(a);
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  function init(makeCanvas) {
    if (S.inited) return;
    var mk = typeof makeCanvas === 'function' ? makeCanvas : defaultMakeCanvas;
    S.parchTile = bakeParchmentTile(mk);
    S.marginL = bakeMarginTile(mk, false);
    S.marginR = bakeMarginTile(mk, true);
    var names = Object.keys(SPRITE_DATA);
    for (var i = 0; i < names.length; i++) {
      var nm = names[i];
      S.sp[nm] = bakeSprite(mk, SPRITE_DATA[nm]);
    }
    S.inited = true;
  }

  function ensureInit() {
    if (!S.inited) init();
  }

  function drawScrollRoller(ctx, x, y, w) {
    var ry = Math.round(y);
    var rx = Math.round(x);
    var rw = Math.round(w);
    // Horizontal turned oak roller bar
    ctx.fillStyle = '#0c121a';
    ctx.fillRect(rx + 6, ry - 9, rw - 12, 18);
    ctx.fillStyle = '#4a2e1a';
    ctx.fillRect(rx + 8, ry - 7, rw - 16, 14);
    ctx.fillStyle = '#734a2b';
    ctx.fillRect(rx + 8, ry - 6, rw - 16, 4);
    ctx.fillStyle = '#99683f';
    ctx.fillRect(rx + 10, ry - 5, rw - 20, 2);
    ctx.fillStyle = '#2e1b0e';
    ctx.fillRect(rx + 8, ry + 3, rw - 16, 4);
    // Brass wrap rings along roller
    var ringXs = [rx + 42, rx + rw - 48];
    for (var i = 0; i < ringXs.length; i++) {
      ctx.fillStyle = '#0c121a';
      ctx.fillRect(ringXs[i] - 1, ry - 8, 8, 16);
      ctx.fillStyle = '#c99336';
      ctx.fillRect(ringXs[i], ry - 7, 6, 14);
      ctx.fillStyle = '#ffe27a';
      ctx.fillRect(ringXs[i] + 1, ry - 6, 4, 4);
      ctx.fillStyle = '#7d5218';
      ctx.fillRect(ringXs[i], ry + 3, 6, 4);
    }
    // Finial caps on left & right ends
    ctx.drawImage(S.sp.rollerCapL, rx - 14, ry - 11, 26, 22);
    ctx.drawImage(S.sp.rollerCapR, rx + rw - 12, ry - 11, 26, 22);
  }

  function pickZoneStamps(segName, segIdx, totalSegs) {
    var nm = String(segName || '');
    if (nm.indexOf('树冠') >= 0 || nm.indexOf('冠') >= 0) {
      return ['lm_canopy', 'lm_totem'];
    }
    if (nm.indexOf('腹地') >= 0 || nm.indexOf('深') >= 0) {
      return ['lm_bramble', 'lm_totem'];
    }
    if (nm.indexOf('林缘') >= 0 || nm.indexOf('缘') >= 0) {
      return ['lm_tree', 'lm_fern'];
    }
    if (segIdx === totalSegs - 1 && totalSegs >= 2) return ['lm_canopy', 'lm_totem'];
    if (segIdx === 0) return ['lm_tree', 'lm_fern'];
    return ['lm_bramble', 'lm_totem'];
  }

  function drawMapScrollBg(ctx, x, y, w, h, camY, worldH, gateY, segments) {
    ensureInit();
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    var vx = Math.round(x), vy = Math.round(y);
    var vw = Math.max(80, Math.round(w)), vh = Math.max(80, Math.round(h));
    var cyOff = Number(camY) || 0;
    var wh = Math.max(vh, Number(worldH) || vh);

    // Clip cleanly to map viewport
    ctx.beginPath();
    ctx.rect(vx, vy, vw, vh);
    ctx.clip();

    // Dark backing behind scroll edges
    ctx.fillStyle = '#151b16';
    ctx.fillRect(vx, vy, vw, vh);

    // Seamless vertical & horizontal parchment tiling (2x crisp pixel scale = 256px tile)
    var tileSize = 256;
    var startY = vy - (((Math.floor(cyOff) % tileSize) + tileSize) % tileSize);
    var innerX = vx + 16;
    var innerW = Math.max(16, vw - 32);

    ctx.save();
    ctx.beginPath();
    ctx.rect(innerX, vy, innerW, vh);
    ctx.clip();
    for (var py = startY; py < vy + vh + tileSize; py += tileSize) {
      for (var px = innerX; px < innerX + innerW + tileSize; px += tileSize) {
        ctx.drawImage(S.parchTile, px, py, tileSize, tileSize);
      }
    }

    // Subtle center warm lift & stepped side curl shading (zero blur)
    ctx.fillStyle = 'rgba(255, 232, 186, 0.035)';
    ctx.fillRect(vx + Math.round(vw * 0.22), vy, Math.round(vw * 0.56), vh);

    var curlSteps = [
      { off: 28, w: 12, a: 0.22 },
      { off: 40, w: 14, a: 0.12 },
      { off: 54, w: 16, a: 0.05 }
    ];
    for (var cs = 0; cs < curlSteps.length; cs++) {
      var st = curlSteps[cs];
      ctx.fillStyle = 'rgba(14, 10, 6, ' + st.a + ')';
      ctx.fillRect(vx + st.off, vy, st.w, vh);
      ctx.fillRect(vx + vw - st.off - st.w, vy, st.w, vh);
    }

    // Faint cartographic horizontal survey dashes in outer margins
    var latStep = 120;
    var firstLat = Math.floor(cyOff / latStep) * latStep;
    ctx.fillStyle = 'rgba(138, 114, 74, 0.20)';
    for (var wy = firstLat; wy <= cyOff + vh + latStep; wy += latStep) {
      var sy = Math.round(vy + wy - cyOff);
      for (var dx = 0; dx < 56; dx += 8) {
        ctx.fillRect(vx + 56 + dx, sy, 4, 1);
        ctx.fillRect(vx + vw - 112 + dx, sy, 4, 1);
      }
    }

    // Segment landmark watermarks along outer margins (never intrude on central nodes)
    var segList = (Array.isArray(segments) && segments.length > 0)
      ? segments
      : [
          { name: '林缘', from: 1, to: 4 },
          { name: '腹地', from: 5, to: 7 },
          { name: '巨木树冠', from: 8, to: 8 }
        ];
    var minStep = Infinity, maxStep = -Infinity;
    for (var si = 0; si < segList.length; si++) {
      var f = Number(segList[si].from) || 1;
      var to = Number(segList[si].to) || f;
      if (f < minStep) minStep = f;
      if (to > maxStep) maxStep = to;
    }
    var stepSpan = Math.max(1, maxStep - minStep + 1);
    var leftMarginX = vx + 54;
    var rightMarginX = vx + vw - 134;

    for (var k = 0; k < segList.length; k++) {
      var seg = segList[k];
      var sFrom = Number(seg.from) || minStep;
      var sTo = Number(seg.to) || sFrom;
      // Bottom-to-top progression: step 1 near worldH, maxStep near 0
      var segTop = Math.round(wh * (maxStep - sTo) / stepSpan);
      var segBot = Math.round(wh * (maxStep - sFrom + 1) / stepSpan);
      var stamps = pickZoneStamps(seg.name, k, segList.length);

      var spacing = 156;
      var stampIdx = 0;
      for (var my = segTop + 44; my <= segBot - 36; my += spacing) {
        var screenY = Math.round(vy + my - cyOff);
        if (screenY >= vy - 96 && screenY <= vy + vh + 96) {
          var sKeyL = stamps[stampIdx % stamps.length];
          var sKeyR = stamps[(stampIdx + 1) % stamps.length];
          var jitterL = ((stampIdx * 17 + k * 11) % 14) - 4;
          var jitterR = ((stampIdx * 23 + k * 7) % 14) - 8;
          ctx.globalAlpha = 0.42;
          ctx.drawImage(S.sp[sKeyL], leftMarginX + jitterL, screenY - 40, 80, 80);
          ctx.drawImage(S.sp[sKeyR], rightMarginX + jitterR, screenY - 26, 80, 80);
        }
        stampIdx++;
      }

      // Subtle sepia hand-inked zone stamp label on left margin
      if (seg.name) {
        var midY = Math.round(vy + (segTop + segBot) * 0.5 - cyOff);
        if (midY >= vy - 30 && midY <= vy + vh + 30) {
          ctx.globalAlpha = 0.68;
          ctx.font = '700 11px "PingFang SC", "Microsoft YaHei", sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          var lx = vx + 58;
          ctx.fillStyle = '#241c13';
          ctx.fillRect(lx - 4, midY - 10, seg.name.length * 12 + 12, 20);
          ctx.fillStyle = '#8a724a';
          ctx.fillRect(lx - 4, midY - 10, seg.name.length * 12 + 12, 1);
          ctx.fillRect(lx - 4, midY + 9, seg.name.length * 12 + 12, 1);
          ctx.fillStyle = '#c9b082';
          ctx.fillText(seg.name, lx + 2, midY + 1);
        }
      }
    }

    // Flanking mossy stone pillar watermarks near gateY
    if (typeof gateY === 'number' && isFinite(gateY)) {
      var gsy = Math.round(vy + gateY - cyOff);
      if (gsy >= vy - 90 && gsy <= vy + vh + 90) {
        ctx.globalAlpha = 0.48;
        ctx.drawImage(S.sp.lm_pillar, vx + 48, gsy - 46, 76, 76);
        ctx.drawImage(S.sp.lm_pillar, vx + vw - 124, gsy - 46, 76, 76);
      }
    }

    // Vintage compass rose watermark near lower-right scroll corner
    var compY = Math.round(vy + wh - 118 - cyOff);
    if (compY >= vy - 100 && compY <= vy + vh + 100) {
      ctx.globalAlpha = 0.36;
      ctx.drawImage(S.sp.lm_compass, vx + vw - 146, compY - 44, 88, 88);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Seamless rolled parchment left & right margin borders (2x scale = 56x256)
    var mTileH = 256;
    var mStartY = vy - (((Math.floor(cyOff) % mTileH) + mTileH) % mTileH);
    for (var my2 = mStartY; my2 < vy + vh + mTileH; my2 += mTileH) {
      ctx.drawImage(S.marginL, vx, my2, 56, mTileH);
      ctx.drawImage(S.marginR, vx + vw - 56, my2, 56, mTileH);
    }

    // World top & bottom turned wooden scroll rollers when scrolled into view
    var topRollerY = vy + 12 - cyOff;
    if (topRollerY >= vy - 24 && topRollerY <= vy + vh + 24) {
      drawScrollRoller(ctx, vx + 10, topRollerY, vw - 20);
    }
    var botRollerY = vy + wh - 12 - cyOff;
    if (botRollerY >= vy - 24 && botRollerY <= vy + vh + 24) {
      drawScrollRoller(ctx, vx + 10, botRollerY, vw - 20);
    }

    // Stepped top & bottom scroll-tuck edge bands (depth framing while scrolling)
    var edgeBands = [
      { dy: 0, h: 4, a: 0.52 },
      { dy: 4, h: 5, a: 0.28 },
      { dy: 9, h: 6, a: 0.12 }
    ];
    for (var eb = 0; eb < edgeBands.length; eb++) {
      var bnd = edgeBands[eb];
      ctx.fillStyle = 'rgba(10, 8, 6, ' + bnd.a + ')';
      ctx.fillRect(vx + 8, vy + bnd.dy, vw - 16, bnd.h);
      ctx.fillRect(vx + 8, vy + vh - bnd.dy - bnd.h, vw - 16, bnd.h);
    }
    // Crisp top/bottom antique bronze rim lines
    ctx.fillStyle = '#85602c';
    ctx.fillRect(vx + 10, vy, vw - 20, 2);
    ctx.fillRect(vx + 10, vy + vh - 2, vw - 20, 2);

    ctx.restore();
  }

  function drawMapGateDivider(ctx, x0, x1, y, passed, t) {
    ensureInit();
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    var lx = Math.round(Math.min(x0, x1));
    var rx = Math.round(Math.max(x0, x1));
    var yy = Math.round(y);
    var cx = Math.round((lx + rx) * 0.5);
    var time = Number(t) || 0;
    var isPassed = !!passed;

    if (isPassed) {
      ctx.globalAlpha = 0.74;
    }

    var embW = 56, embH = 40;
    var leftEnd = cx - Math.round(embW * 0.5) + 2;
    var rightStart = cx + Math.round(embW * 0.5) - 2;

    // Tile mossy stone masonry lintel left and right of central archway
    var tileW = 32, tileH = 16;
    if (leftEnd > lx + 12) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(lx + 10, yy - 8, leftEnd - (lx + 10), tileH);
      ctx.clip();
      for (var px = lx + 10; px < leftEnd; px += tileW) {
        ctx.drawImage(S.sp.gateBrick, px, yy - 8, tileW, tileH);
      }
      ctx.restore();
    }
    if (rx - 12 > rightStart) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(rightStart, yy - 8, (rx - 10) - rightStart, tileH);
      ctx.clip();
      for (var px2 = rightStart; px2 < rx - 10; px2 += tileW) {
        ctx.drawImage(S.sp.gateBrick, px2, yy - 8, tileW, tileH);
      }
      ctx.restore();
    }

    // Carved stone end-caps at x0 and x1
    var caps = [lx + 2, rx - 14];
    for (var ci = 0; ci < caps.length; ci++) {
      var ex = caps[ci];
      ctx.fillStyle = '#0c121a';
      ctx.fillRect(ex - 1, yy - 11, 14, 22);
      ctx.fillStyle = '#6e757a';
      ctx.fillRect(ex, yy - 10, 12, 20);
      ctx.fillStyle = '#a3a8ad';
      ctx.fillRect(ex + 1, yy - 9, 10, 3);
      ctx.fillStyle = '#444b50';
      ctx.fillRect(ex + 1, yy + 6, 10, 3);
      ctx.fillStyle = isPassed ? '#54735f' : '#68b891';
      ctx.fillRect(ex + 4, yy - 2, 4, 4);
    }

    // Hanging moss tendrils along stone beam
    var tendrilStep = 44;
    for (var tx = lx + 24; tx < rx - 24; tx += tendrilStep) {
      if (Math.abs(tx - cx) < 36) continue;
      var len = 5 + ((tx * 7) % 7);
      ctx.fillStyle = '#27592a';
      ctx.fillRect(tx, yy + 6, 3, len);
      ctx.fillStyle = '#48913b';
      ctx.fillRect(tx + 1, yy + 6, 2, Math.max(2, len - 2));
      ctx.fillStyle = '#79c958';
      ctx.fillRect(tx + 1, yy + 6, 1, 2);
    }

    // Unpassed crystal moss vein pulse dots along lintel (pure crisp pixel fills)
    if (!isPassed) {
      var pulse = 0.5 + 0.5 * Math.sin(time * 3.4);
      var bright = pulse > 0.55;
      var veinStep = 36;
      for (var vx = lx + 28; vx < rx - 28; vx += veinStep) {
        if (Math.abs(vx - cx) < 34) continue;
        var wave = 0.5 + 0.5 * Math.sin(time * 3.4 - Math.abs(vx - cx) * 0.03);
        ctx.fillStyle = wave > 0.65 ? '#b8ffee' : '#4ec9a8';
        ctx.fillRect(vx, yy - 1, 4, 2);
        if (bright && wave > 0.75) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(vx + 1, yy - 1, 2, 2);
        }
      }
    }

    // Central miniature pixel mossy stone archway badge
    var gateSprite = isPassed ? S.sp.gateOpen : S.sp.gateClosed;
    ctx.drawImage(gateSprite, cx - Math.round(embW * 0.5), yy - Math.round(embH * 0.5) - 1, embW, embH);

    // Subtle pulsing crystal keystone spark when gate is still ahead
    if (!isPassed) {
      var gp = 0.5 + 0.5 * Math.sin(time * 4.2);
      if (gp > 0.35) {
        ctx.fillStyle = gp > 0.72 ? '#e0fff8' : '#7ef2d4';
        ctx.fillRect(cx - 2, yy - 15, 4, 3);
      }
    }

    ctx.restore();
  }

  function drawPixelRing(ctx, cx, cy, radius, color, thickness) {
    var segs = 24;
    var th = thickness || 2;
    ctx.fillStyle = color;
    for (var i = 0; i < segs; i++) {
      var a = (i / segs) * Math.PI * 2;
      var px = Math.round(cx + Math.cos(a) * radius - th * 0.5);
      var py = Math.round(cy + Math.sin(a) * radius - th * 0.5);
      ctx.fillRect(px, py, th, th);
    }
  }

  function drawPixelSpark(ctx, x, y, colCore, colTip) {
    var ix = Math.round(x), iy = Math.round(y);
    ctx.fillStyle = colTip;
    ctx.fillRect(ix - 2, iy, 5, 1);
    ctx.fillRect(ix, iy - 2, 1, 5);
    ctx.fillStyle = colCore;
    ctx.fillRect(ix, iy, 1, 1);
  }

  function drawMapNode(ctx, type, cx, cy, r, state) {
    ensureInit();
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    var st = state || {};
    var status = st.status || 'future';
    var hover = !!st.hover;
    var time = Number(st.t) || 0;
    var x = Math.round(cx), y = Math.round(cy);
    var isBoss = type === 'boss';
    var rad = Math.max(12, Math.round(Number(r) || (isBoss ? 30 : 19)));

    // Pick pre-baked node sprite
    var sprite = S.sp.node_battle;
    if (type === 'elite') sprite = S.sp.node_elite;
    else if (type === 'event') sprite = S.sp.node_event;
    else if (type === 'shop') sprite = S.sp.node_shop;
    else if (type === 'camp') sprite = (Math.floor(time * 3.5) % 2 === 0) ? S.sp.node_camp_0 : S.sp.node_camp_1;
    else if (type === 'boss') sprite = S.sp.node_boss;

    // 1. Animated dual-layer pixel gold ring & pointer for available nodes (pure crisp pixel fills)
    if (status === 'avail') {
      var breath = Math.round(Math.sin(time * 4.2) * 1.5);
      var outerR = rad + 6 + breath;
      // Dark contrast halo ring
      drawPixelRing(ctx, x, y, outerR + 1, '#120e07', 4);
      // Outer breathing warm-gold pixel ring
      drawPixelRing(ctx, x, y, outerR, '#ffd666', 2);
      // Inner rotating dotted cream-gold ring
      var pipCount = 12;
      for (var pi = 0; pi < pipCount; pi++) {
        var ang = time * 1.5 + (pi / pipCount) * Math.PI * 2;
        var ppx = Math.round(x + Math.cos(ang) * (rad + 3));
        var ppy = Math.round(y + Math.sin(ang) * (rad + 3));
        ctx.fillStyle = (pi % 2 === 0) ? '#fff6c4' : '#e6ab3c';
        ctx.fillRect(ppx - 1, ppy - 1, 2, 2);
      }
      // 4 rotating four-point pixel sparkles
      for (var si = 0; si < 4; si++) {
        var sang = time * 1.1 + si * Math.PI * 0.5;
        var sx = x + Math.cos(sang) * (outerR + 3);
        var sy = y + Math.sin(sang) * (outerR + 3);
        drawPixelSpark(ctx, sx, sy, '#ffffff', '#ffd86b');
      }
      // Bobbing golden pointer chevron above node
      var bob = Math.round(Math.sin(time * 5.2) * 2);
      ctx.drawImage(S.sp.node_ptr, x - 6, y - rad - 16 + bob, 12, 10);
    }

    // 2. Hover platinum-gold pixel frame (for future or avail)
    if (hover && status !== 'dim') {
      var hr = rad + (status === 'avail' ? 9 : 4);
      drawPixelRing(ctx, x, y, hr, '#fff6d6', 2);
      // 4 crisp corner accent brackets
      var bOff = hr - 1;
      ctx.fillStyle = '#ffe27a';
      ctx.fillRect(x - bOff, y - bOff, 6, 2);
      ctx.fillRect(x - bOff, y - bOff, 2, 6);
      ctx.fillRect(x + bOff - 5, y - bOff, 6, 2);
      ctx.fillRect(x + bOff - 1, y - bOff, 2, 6);
      ctx.fillRect(x - bOff, y + bOff - 1, 6, 2);
      ctx.fillRect(x - bOff, y + bOff - 5, 2, 6);
      ctx.fillRect(x + bOff - 5, y + bOff - 1, 6, 2);
      ctx.fillRect(x + bOff - 1, y + bOff - 5, 2, 6);
    }

    // 3. Dimmed / missed node state
    if (status === 'dim') {
      ctx.globalAlpha *= 0.38;
    }

    // Solid offset drop plate (no blur)
    ctx.fillStyle = '#0c121a';
    ctx.beginPath();
    ctx.arc(x, y + 2, rad + 1, 0, Math.PI * 2);
    ctx.fill();

    // Base medallion backing
    if (status === 'visited') {
      ctx.fillStyle = '#4c545b';
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#292f35';
      ctx.beginPath();
      ctx.arc(x, y, rad - 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      var rimCol = '#738291';
      var bgCol = '#20262e';
      if (type === 'elite') { rimCol = '#e6ad3c'; bgCol = '#471717'; }
      else if (type === 'event') { rimCol = '#9378db'; bgCol = '#251b42'; }
      else if (type === 'shop') { rimCol = '#e8b648'; bgCol = '#3b2814'; }
      else if (type === 'camp') { rimCol = '#d97a38'; bgCol = '#331d12'; }
      else if (type === 'boss') { rimCol = '#f2c24e'; bgCol = '#2d1c10'; }
      if (status === 'avail') { rimCol = '#ffe27a'; }

      ctx.fillStyle = rimCol;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = bgCol;
      ctx.beginPath();
      ctx.arc(x, y, rad - 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw pre-baked crisp pixel badge
    var drawSize = Math.round(rad * (isBoss ? 2.25 : 2.15));
    var half = Math.round(drawSize * 0.5);
    if (status === 'visited') {
      ctx.save();
      ctx.globalAlpha *= 0.52;
      ctx.drawImage(sprite, x - half, y - half, drawSize, drawSize);
      ctx.restore();
      // Bold warm-gold pixel checkmark stamp
      var chkSz = Math.round(Math.max(18, rad * 1.15));
      ctx.drawImage(S.sp.node_check, x - Math.round(chkSz * 0.35), y - Math.round(chkSz * 0.35), chkSz, chkSz);
    } else {
      ctx.drawImage(sprite, x - half, y - half, drawSize, drawSize);
      if (status === 'dim') {
        // Muted slate veil to keep contrast ~35%
        ctx.fillStyle = 'rgba(24, 29, 34, 0.42)';
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawTitleEmblem(ctx, cx, cy, title, sub, t) {
    ensureInit();
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    var time = Number(t) || 0;
    var mainTxt = String(title || '落果密林');
    var subTxt = sub ? String(sub) : '';

    ctx.font = '900 30px "PingFang SC", "Microsoft YaHei", sans-serif';
    var tw = ctx.measureText(mainTxt).width || 120;
    ctx.font = '600 12px "PingFang SC", "Microsoft YaHei", sans-serif';
    var sw = subTxt ? (ctx.measureText(subTxt).width || 140) : 0;

    var pw = Math.max(296, Math.min(430, Math.round(Math.max(tw + 140, sw + 96))));
    var ph = subTxt ? 86 : 68;
    var x0 = Math.round(cx - pw * 0.5);
    var y0 = Math.round(cy - ph * 0.5);

    // Solid offset pixel drop plate
    ctx.fillStyle = '#0c121a';
    ctx.fillRect(x0 + 4, y0 + 5, pw, ph);
    // Stepped outer dark ink outline
    ctx.fillRect(x0 - 2, y0 + 2, pw + 4, ph - 4);
    ctx.fillRect(x0 + 2, y0 - 2, pw - 4, ph + 4);

    // Hammered bronze beveled outer frame
    ctx.fillStyle = '#996829';
    ctx.fillRect(x0, y0, pw, ph);
    ctx.fillStyle = '#e0b055';
    ctx.fillRect(x0 + 2, y0 + 1, pw - 4, 3);
    ctx.fillRect(x0 + 1, y0 + 2, 3, ph - 4);
    ctx.fillStyle = '#543412';
    ctx.fillRect(x0 + 2, y0 + ph - 4, pw - 4, 3);
    ctx.fillRect(x0 + pw - 4, y0 + 2, 3, ph - 4);

    // Inner oak wooden signboard planks
    var ix = x0 + 6, iy = y0 + 6, iw = pw - 12, ih = ph - 12;
    ctx.fillStyle = '#0c121a';
    ctx.fillRect(ix - 1, iy - 1, iw + 2, ih + 2);
    ctx.fillStyle = '#3b271a';
    ctx.fillRect(ix, iy, iw, ih);
    // Horizontal plank tone strips & grain seams
    ctx.fillStyle = '#473020';
    ctx.fillRect(ix, iy + 2, iw, Math.round(ih * 0.34));
    ctx.fillStyle = '#312015';
    ctx.fillRect(ix, iy + Math.round(ih * 0.66), iw, ih - Math.round(ih * 0.66));
    ctx.fillStyle = '#24170e';
    ctx.fillRect(ix, iy + Math.round(ih * 0.36), iw, 2);
    ctx.fillRect(ix, iy + Math.round(ih * 0.66), iw, 2);
    // Subtle inner bronze pinstripe
    ctx.strokeStyle = '#b58438';
    ctx.lineWidth = 1;
    ctx.strokeRect(ix + 3.5, iy + 3.5, iw - 7, ih - 7);

    // Corner brass rivets
    var rivets = [
      [x0 + 9, y0 + 9], [x0 + pw - 13, y0 + 9],
      [x0 + 9, y0 + ph - 13], [x0 + pw - 13, y0 + ph - 13]
    ];
    for (var ri = 0; ri < rivets.length; ri++) {
      var rx = rivets[ri][0], ry = rivets[ri][1];
      ctx.fillStyle = '#0c121a';
      ctx.fillRect(rx - 1, ry - 1, 6, 6);
      ctx.fillStyle = '#c99336';
      ctx.fillRect(rx, ry, 4, 4);
      ctx.fillStyle = '#fff0a8';
      ctx.fillRect(rx, ry, 2, 2);
    }

    // Flanking verdant vines with tender leaves & red fallen fruits
    ctx.drawImage(S.sp.vineL, x0 - 20, Math.round(cy - 40), 52, 80);
    ctx.drawImage(S.sp.vineR, x0 + pw - 32, Math.round(cy - 40), 52, 80);

    // Top center triple-primary-color gem bezel
    var gemX = Math.round(cx - 44);
    var gemY = y0 - 22;
    ctx.drawImage(S.sp.gemTriad, gemX, gemY, 88, 36);
    // Alternating crisp 2px pixel glint on the 3 gems
    var glintIdx = Math.floor(time * 2.6) % 3;
    var gxList = [gemX + 24, gemX + 43, gemX + 58];
    var gyList = [gemY + 18, gemY + 15, gemY + 18];
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(gxList[glintIdx], gyList[glintIdx], 2, 2);

    // Main title typography: warm-gold gradient + hard #0c121a stroke & offset
    var titleY = subTxt ? (y0 + 36) : Math.round(cy + 2);
    ctx.font = '900 30px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#0c121a';
    ctx.strokeText(mainTxt, cx, titleY + 2);
    ctx.strokeText(mainTxt, cx, titleY);

    var tg = ctx.createLinearGradient(0, titleY - 16, 0, titleY + 16);
    tg.addColorStop(0, '#fff7cc');
    tg.addColorStop(0.52, '#f5c651');
    tg.addColorStop(1, '#c48124');
    ctx.fillStyle = tg;
    ctx.fillText(mainTxt, cx, titleY);

    // Compact subtitle parchment-bronze strip tucked at lower edge
    if (subTxt) {
      var subW = Math.min(pw - 36, Math.max(176, Math.round(sw + 44)));
      var subX = Math.round(cx - subW * 0.5);
      var subY = y0 + ph - 14;
      ctx.fillStyle = '#0c121a';
      ctx.fillRect(subX - 2, subY - 1, subW + 4, 24);
      ctx.fillStyle = '#241c15';
      ctx.fillRect(subX, subY + 1, subW, 20);
      ctx.fillStyle = '#c49443';
      ctx.fillRect(subX + 2, subY + 1, subW - 4, 1);
      ctx.fillRect(subX + 2, subY + 20, subW - 4, 1);
      // Flanking gold pixel diamonds
      ctx.fillStyle = '#ffe27a';
      ctx.fillRect(subX + 8, subY + 9, 4, 4);
      ctx.fillRect(subX + subW - 12, subY + 9, 4, 4);

      ctx.font = '600 12px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#efe5cc';
      ctx.fillText(subTxt, cx, subY + 11);
    }

    ctx.restore();
  }

  function drawSceneRibbon(ctx, cx, y, w, title, sub) {
    ensureInit();
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    var mainTxt = String(title || '');
    var subTxt = sub ? String(sub) : '';
    var rw = Math.max(210, Math.round(Number(w) || 380));
    var rh = subTxt ? 42 : 30;
    var x0 = Math.round(cx - rw * 0.5);
    var y0 = Math.round(y - rh * 0.5);

    // Folded swallowtail pixel ribbons extending left & right
    var tailW = 22;
    var tailDrop = 4;
    // Left swallowtail
    ctx.fillStyle = '#0c121a';
    ctx.beginPath();
    ctx.moveTo(x0 + 4, y0 + tailDrop - 2);
    ctx.lineTo(x0 - tailW - 2, y0 + tailDrop - 2);
    ctx.lineTo(x0 - tailW + 8, y0 + Math.round(rh * 0.5) + tailDrop);
    ctx.lineTo(x0 - tailW - 2, y0 + rh + tailDrop + 2);
    ctx.lineTo(x0 + 4, y0 + rh + tailDrop + 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#632e2b';
    ctx.beginPath();
    ctx.moveTo(x0 + 2, y0 + tailDrop);
    ctx.lineTo(x0 - tailW + 1, y0 + tailDrop);
    ctx.lineTo(x0 - tailW + 10, y0 + Math.round(rh * 0.5) + tailDrop);
    ctx.lineTo(x0 - tailW + 1, y0 + rh + tailDrop);
    ctx.lineTo(x0 + 2, y0 + rh + tailDrop);
    ctx.closePath();
    ctx.fill();
    // Ribbon top catch highlight & dark fold-under triangle
    ctx.fillStyle = '#944a42';
    ctx.fillRect(x0 - tailW + 2, y0 + tailDrop, tailW - 1, 2);
    ctx.fillStyle = '#331514';
    ctx.beginPath();
    ctx.moveTo(x0, y0 + rh);
    ctx.lineTo(x0 + 8, y0 + rh);
    ctx.lineTo(x0 + 8, y0 + rh + tailDrop);
    ctx.closePath();
    ctx.fill();

    // Right swallowtail
    var x1 = x0 + rw;
    ctx.fillStyle = '#0c121a';
    ctx.beginPath();
    ctx.moveTo(x1 - 4, y0 + tailDrop - 2);
    ctx.lineTo(x1 + tailW + 2, y0 + tailDrop - 2);
    ctx.lineTo(x1 + tailW - 8, y0 + Math.round(rh * 0.5) + tailDrop);
    ctx.lineTo(x1 + tailW + 2, y0 + rh + tailDrop + 2);
    ctx.lineTo(x1 - 4, y0 + rh + tailDrop + 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#632e2b';
    ctx.beginPath();
    ctx.moveTo(x1 - 2, y0 + tailDrop);
    ctx.lineTo(x1 + tailW - 1, y0 + tailDrop);
    ctx.lineTo(x1 + tailW - 10, y0 + Math.round(rh * 0.5) + tailDrop);
    ctx.lineTo(x1 + tailW - 1, y0 + rh + tailDrop);
    ctx.lineTo(x1 - 2, y0 + rh + tailDrop);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#944a42';
    ctx.fillRect(x1 - 1, y0 + tailDrop, tailW - 1, 2);
    ctx.fillStyle = '#331514';
    ctx.beginPath();
    ctx.moveTo(x1, y0 + rh);
    ctx.lineTo(x1 - 8, y0 + rh);
    ctx.lineTo(x1 - 8, y0 + rh + tailDrop);
    ctx.closePath();
    ctx.fill();

    // Slender central timber-and-parchment nameplate
    ctx.fillStyle = '#0c121a';
    ctx.fillRect(x0 - 2, y0 - 2, rw + 4, rh + 4);
    var bgGrad = ctx.createLinearGradient(0, y0, 0, y0 + rh);
    bgGrad.addColorStop(0, '#3d3124');
    bgGrad.addColorStop(0.5, '#2e241a');
    bgGrad.addColorStop(1, '#231b13');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(x0, y0, rw, rh);

    // Antique gold double rim
    ctx.fillStyle = '#c99844';
    ctx.fillRect(x0 + 2, y0, rw - 4, 2);
    ctx.fillStyle = '#7d5924';
    ctx.fillRect(x0 + 2, y0 + rh - 2, rw - 4, 2);
    ctx.fillStyle = 'rgba(255, 228, 152, 0.22)';
    ctx.fillRect(x0 + 12, y0 + 3, rw - 24, 1);

    // Copper-riveted wood beam end-brackets
    var ends = [x0, x1 - 10];
    for (var ei = 0; ei < ends.length; ei++) {
      var bx = ends[ei];
      ctx.fillStyle = '#8f6227';
      ctx.fillRect(bx, y0, 10, rh);
      ctx.fillStyle = '#d9a74c';
      ctx.fillRect(bx + 1, y0 + 1, 8, 2);
      ctx.fillStyle = '#4a2e10';
      ctx.fillRect(bx + 1, y0 + rh - 3, 8, 2);
      // 2 brass studs per cap
      ctx.fillStyle = '#fff0a8';
      ctx.fillRect(bx + 4, y0 + 6, 2, 2);
      ctx.fillRect(bx + 4, y0 + rh - 8, 2, 2);
    }

    // Center top tiny gold diamond crest pip
    ctx.fillStyle = '#0c121a';
    ctx.fillRect(Math.round(cx) - 4, y0 - 4, 8, 6);
    ctx.fillStyle = '#ffe27a';
    ctx.fillRect(Math.round(cx) - 2, y0 - 2, 4, 3);

    // Title & subtitle text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (subTxt) {
      ctx.font = '800 15px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0c121a';
      ctx.strokeText(mainTxt, cx, y0 + 14);
      ctx.fillStyle = '#ffe699';
      ctx.fillText(mainTxt, cx, y0 + 14);

      ctx.font = '500 11px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#d4cbb6';
      ctx.fillText(subTxt, cx, y0 + 31);
    } else {
      ctx.font = '800 16px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0c121a';
      ctx.strokeText(mainTxt, cx, y0 + Math.round(rh * 0.5) + 1);
      ctx.fillStyle = '#ffe699';
      ctx.fillText(mainTxt, cx, y0 + Math.round(rh * 0.5) + 1);
    }

    ctx.restore();
  }

  function drawChoiceIcon(ctx, kind, cx, cy, size) {
    ensureInit();
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    var key = 'icon_' + String(kind || '');
    var sprite = S.sp[key] || S.sp.icon_event_stele;
    var sz = Math.max(16, Math.round(Number(size) || 34));
    var half = Math.round(sz * 0.5);
    var x0 = Math.round(cx - half);
    var y0 = Math.round(cy - half);

    // Category-tinted antique bezel frame around icon
    var rim = '#9e7c44';
    var hi = '#e8c474';
    if (String(kind).indexOf('camp_') === 0) { rim = '#b56333'; hi = '#ffab66'; }
    else if (String(kind).indexOf('shop_') === 0) { rim = '#bf9234'; hi = '#ffe27a'; }
    else if (String(kind).indexOf('gate_') === 0) { rim = '#4d8c70'; hi = '#88d9b4'; }
    else if (String(kind).indexOf('event_') === 0) { rim = '#68798a'; hi = '#a8bed1'; }

    // Crisp stepped pixel outer frame
    ctx.fillStyle = '#0c121a';
    ctx.fillRect(x0 - 3, y0 - 2, sz + 6, sz + 5);
    ctx.fillRect(x0 - 2, y0 - 3, sz + 4, sz + 7);
    ctx.fillStyle = rim;
    ctx.fillRect(x0 - 2, y0 - 2, sz + 4, sz + 4);
    ctx.fillStyle = hi;
    ctx.fillRect(x0 - 2, y0 - 2, sz + 4, 2);
    ctx.fillRect(x0 - 2, y0 - 2, 2, sz + 4);

    // Blit 28x28 hand-crafted pixel icon crisp
    ctx.drawImage(sprite, x0, y0, sz, sz);

    // Tiny corner brass pips
    ctx.fillStyle = '#fff5cc';
    ctx.fillRect(x0 - 2, y0 - 2, 2, 2);
    ctx.fillRect(x0 + sz, y0 - 2, 2, 2);

    ctx.restore();
  }

  function drawSummaryCrest(ctx, cx, cy, outcome, t) {
    ensureInit();
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    var time = Number(t) || 0;
    var key = 'crest_retreat';
    if (outcome === 'victory') key = 'crest_victory';
    else if (outcome === 'defeat') key = 'crest_defeat';

    var cw = 180, ch = 72;
    var x0 = Math.round(cx - cw * 0.5);
    var y0 = Math.round(cy - ch * 0.5);

    ctx.drawImage(S.sp[key], x0, y0, cw, ch);

    // Tasteful crisp integer-pixel ambient sparkles (pure crisp pixel fills)
    if (outcome === 'victory') {
      var spPts = [
        [cx - 64, cy - 22, 0],
        [cx + 62, cy - 20, 1.6],
        [cx - 34, cy - 30, 3.1],
        [cx + 36, cy - 28, 4.5]
      ];
      for (var i = 0; i < spPts.length; i++) {
        var ph = Math.sin(time * 3.8 + spPts[i][2]);
        if (ph > 0.25) {
          drawPixelSpark(ctx, spPts[i][0], spPts[i][1], '#ffffff', ph > 0.7 ? '#ffe27a' : '#c99336');
        }
      }
    } else if (outcome === 'retreat') {
      var coinPts = [
        [cx - 24, cy - 19, 0],
        [cx - 40, cy + 19, 2.2],
        [cx + 32, cy - 11, 4.0]
      ];
      for (var j = 0; j < coinPts.length; j++) {
        var cp = Math.sin(time * 3.2 + coinPts[j][2]);
        if (cp > 0.45) {
          ctx.fillStyle = '#fff9d6';
          ctx.fillRect(Math.round(coinPts[j][0]), Math.round(coinPts[j][1]), 2, 2);
        }
      }
    } else if (outcome === 'defeat') {
      for (var d = 0; d < 3; d++) {
        var prog = (time * 0.35 + d * 0.33) % 1;
        var ax = Math.round(cx - 28 + d * 28 + Math.sin(time * 1.5 + d) * 6);
        var ay = Math.round(cy + 18 - prog * 38);
        ctx.fillStyle = prog < 0.6 ? '#7a756f' : '#4a4744';
        ctx.fillRect(ax, ay, 2, 2);
      }
    }

    ctx.restore();
  }

  global.Code00ArtPacks = global.Code00ArtPacks || {};
  global.Code00ArtPacks.mapPanels = {
    id: 'mapPanels',
    version: 1,
    name: '落果密林·手绘卷轴与非战斗装饰',
    init: init,
    drawMapScrollBg: drawMapScrollBg,
    drawMapGateDivider: drawMapGateDivider,
    drawMapNode: drawMapNode,
    drawTitleEmblem: drawTitleEmblem,
    drawSceneRibbon: drawSceneRibbon,
    drawChoiceIcon: drawChoiceIcon,
    drawSummaryCrest: drawSummaryCrest
  };
})(typeof window !== 'undefined' ? window : globalThis);
