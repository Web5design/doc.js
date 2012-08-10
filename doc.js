/**
 * @page About
 * If you want to know how to USE doc.js, please see the [Github page](https://github.com/schteppe/doc.js).
 * 
 * The code for doc.js follows this algorithm:
 * 
 * 1. Load files
 * 2. Parse and construct DOCJS.Block objects
 * 3. Parse commands from the blocks, get a list of DOCJS.Command objects
 * 4. Assemble the DOCJS.Command's to DOCJS.Entity objects.
 * 5. The entities are stored in a DOCJS.Documentation.
 * 6. Render to HTML.
 */

/**
 * @library doc.js
 * @version 0.1.1
 * @brief An on-the-fly documentation generator for javascript
 */
var DOCJS = {};

/**
 * @function DOCJS.Generate
 * @param Array urls
 * @param Object opt
 * @brief Generate Doc.js documentation.
 * @example
 * You use the function like this:
 * ```
 * DOCJS.Generate(["file.js"]);
 * ```
 * ...and then you're done!
 * @endexample
 */
DOCJS.Generate = function(urls,opt){

    // Options
    opt = opt || {};
    var options = {
	title:"Hello World!", // Should these be fetched from the blocks?
	description:"My first Doc.js documentation"
    };
    $.extend(options,opt);
    
    loadBlocks(urls,function(blocks){
	var entities = makeEntities(blocks);
	updateHTML(entities);
    });

    var idCount = 0;
    function newId(){
	return ++idCount;
    }

    // Utility functions
    function trim(s){ return s.replace(/^\s\s*/, '').replace(/\s\s*$/, ''); }
    function ltrim(s){ return s.replace(/^\s+/,''); }
    function rtrim(s){ return s.replace(/\s+$/,''); }
    function fulltrim(s){ return s.replace(/(?:(?:^|\n)\s+|\s+(?:$|\n))/g,'').replace(/\s+/g,' '); }
    function toNice(s){
	var clean = s.replace(/[^a-zA-Z0-9\/_|+ -]+/g, '');
	clean = trim(clean.toLowerCase());
	clean = clean.replace(/[\s\n\t]+/g," ").replace(/\s+/g,"-");
	clean = clean.replace(/[\/_|+ -]+/g, "-");
	return clean;
    }

    // A comment block in the code.
    var blockIdCounter = 0;
    function Block(src,rawSrc,lineNumber){
	this.id = ++blockIdCounter;
	// Diff between src and rawSrc in lines, needed to convert between local and global line numbers
	var idx = rawSrc.indexOf(src);
	this.rawDiff = (rawSrc.substr(0,idx).match(/\n/g)||[]).length;

	var lines, parsedLines = [], that=this;
	function splitLines(){
	    if(!lines) lines = src.split("\n");
	}

	this.filename = "";
	this.src = src;
	this.rawSrc = rawSrc;
	this.lineNumber = lineNumber;

	this.author = [];   // @author
	this.brief = [];    // @brief
	this.classs = [];   // @class
	this.desc = [];     // @desc, @description
	this.event = [];    // @event
	this.example = [];  // @example
	this.file = [];     // @file
	this.func = [];     // @fn, @function
	this.memberof = []; // @memberof
	this.method = [];   // @method
	this.page = [];     // @page
	this.param = [];    // @param, @parameter
	this.property = []; // @property
	this.proto = [];    // @proto, @prototype
	this.ret = [];      // @return, @returns
	this.see = [];      // @see
	this.todo = [];     // @todo

	this.localToGlobalLineNumber = function(lineNumber){
	    return parseInt(lineNumber) + that.lineNumber + that.rawDiff + 1;
	};
	this.markLineAsParsed = function(lineNumber){
	    if(!that.lineIsParsed(lineNumber))
		parsedLines.push(parseInt(lineNumber));
	};
	this.markChunkAsParsed = function(chunk){
	    var idx = src.indexOf(chunk);
	    if(idx != -1){
		var start = idx;
		var end = start+chunk.length;
		var firstLine = (src.substring(0,start).match(/\n/gm)||[]).length;
		var lastLine = (src.substring(start,end).match(/\n/gm)||[]).length + firstLine;
		for(var i=firstLine; i<=lastLine; i++)
		    that.markLineAsParsed(i+that.rawDiff);
	    }
	};
	this.lineIsParsed = function(lineNumber){
	    return parsedLines.indexOf(parseInt(lineNumber))!==-1;
	};
	this.getLine = function(lineNumber){
	    splitLines();
	    return lines[parseInt(lineNumber)];
	};
	this.getNumLines = function(){
	    splitLines();
	    return lines.length;
	};
	this.getUnparsedLines = function(){
	    var unparsed = [], n = that.getNumLines();
	    for(var i=0; i<n; i++){
		if(!that.lineIsParsed(i))
		    unparsed.push(that.getLine(i));
	    }
	    return unparsed;
	};
	// Get object: linenumber => line
	this.getUnparsedLines2 = function(globalLineNumbers){
	    var unparsed = {}, n = that.getNumLines();
	    for(var i=0; i<n; i++){
		if(!that.lineIsParsed(i)){
		    if(globalLineNumbers)
			unparsed[that.localToGlobalLineNumber(i)] = that.getLine(i);
		    else
			unparsed[i] = that.getLine(i);			
		}
	    }
	    return unparsed;
	};
	// get line of first string match
	this.getLineNumber = function(s){
	    var idx = that.src.indexOf(s);
	    if(idx!=-1){
		var lineNumber = (that.src.substr(0,idx).match(/\n/g)||[]).length;
		return lineNumber;
	    } else
		return false;
	}
    }

    var errorReportIdCounter = 0;
    function ErrorReport(filename,lineNumber,message){
	this.lineNumber = lineNumber;
	this.file = filename;
	this.message = message;
	this.id = ++errorReportIdCounter;
    }

    // An Entity is a set of Command's
    // The Entities corresponds to a thing that is viewed to the user, eg. Function, Class etc.
    var globalEntityCounter = 0; // ids unique to all entities
    var entityCounter = {}; // entityName => number. Ids unique within entity type.

    /**
     * @class DOCJS.Entity
     * @param DOCJS.Block block
     * @param string entityName
     * @brief Base class for entities.
     */
    DOCJS.Entity = function(block,entityName){
	this.block = block; // where it was defined

	if(!(entityName in entityCounter))
	    entityCounter[entityName] = 0;
	else
	    entityCounter[entityName]++;
	this.id = entityCounter[entityName];
	this.globalId = ++globalEntityCounter;
    }

    /**
     * @class DOCJS.FileEntity
     * @param DOCJS.Block block
     * @param DOCJS.FileCommand fileCommand
     * @extends DOCJS.Entity
     */
    DOCJS.FileEntity = function(block,fileCommand){
	DOCJS.Entity.call(this,block);
	this.getName = function(){ return fileCommand.getName(); };
    }

    /**
     * @class DOCJS.FunctionEntity
     * @param DOCJS.Block block
     * @param DOCJS.FunctionCommand functionCommand
     * @param DOCJS.ParamCommand paramCommand
     * @param DOCJS.ReturnCommand returnCommand Optional
     * @param DOCJS.BriefCommand briefCommand Optional
     * @param DOCJS.DescriptionCommand descriptionCommand Optional
     * @param DOCJS.ExampleCommand exampleCommand Optional
     * @extends DOCJS.Entity
     */
    DOCJS.FunctionEntity = function(block,
				    functionCommand,
				    paramCommands,
				    returnCommand, // optional
				    briefCommand,   // optional
				    descriptionCommand, // optional
				    exampleCommand // optional
				   ){
	DOCJS.Entity.call(this,block);
	this.getName = function(){ return functionCommand ? functionCommand.getName() : false; };
	this.getBrief = function(){ return briefCommand ? briefCommand.getContent() : false; };
	this.getDescription = function(){ return descriptionCommand ? descriptionCommand.getContent() : false; };

	this.getReturnDataType = function(){ return returnCommand ? returnCommand.getDataType() : false; };
	this.getReturnDescription = function(){ return returnCommand ? returnCommand.getDescription() : false; };

	this.numParams = function(){ return paramCommands.length; };
	this.getParamDataType = function(i){ return paramCommands[i].getDataType(); };
	this.getParamName = function(i){ return paramCommands[i].getName(); };
	this.getParamDescription = function(i){ return paramCommands[i].getDescription(); };
	this.addParam = function(p){ paramCommands.push(p); };

	this.numExamples = function(){ return exampleCommand ? exampleCommand.length : 0; };
	this.getExampleText = function(i){ return exampleCommand[i].getContent(); };
    }

    /**
     * @class DOCJS.LibraryEntity
     * @param DOCJS.Block block
     * @param DOCJS.LibraryCommand libraryCommand
     * @param DOCJS.VersionCommand versionCommand Optional
     * @param DOCJS.BriefCommand briefCommand Optional
     * @param DOCJS.DescriptionCommand descriptionCommand Optional
     * @extends DOCJS.Entity
     */
    DOCJS.LibraryEntity = function(block,
				   libraryCommand,
				   versionCommand, // optional
				   briefCommand,   // optional
				   descriptionCommand // optional
				  ){
	DOCJS.Entity.call(this,block);
	this.getName = function(){ return libraryCommand ? libraryCommand.getName() : false; };
	this.getBrief = function(){ return briefCommand ? briefCommand.getContent() : false; };
	this.getDescription = function(){ return descriptionCommand ? descriptionCommand.getContent() : false; };
	this.getVersion = function(){ return versionCommand ? versionCommand.getContent() : false; };
    }

    /**
     * @class DOCJS.MethodEntity
     * @param DOCJS.Block block
     * @param DOCJS.MemberofCommand memberof
     * @param DOCJS.ParamCommand param
     * @param DOCJS.BriefCommand brief
     * @param DOCJS.ReturnCommand return
     * @extends DOCJS.Entity
     */
    DOCJS.MethodEntity = function(block,
				  methodCommand,
				  memberofCommand,
				  paramCommands,
				  briefCommand,
				  returnCommand){
	DOCJS.Entity.call(this,block);
	this.getName = function(){ return methodCommand.getName(); };
	this.getClassName = function(){ return memberofCommand.getClassName(); };

	this.numParams = function(){ return paramCommands.length; };
	this.getParamDataType = function(i){ return paramCommands[i].getDataType(); };
	this.getParamName = function(i){ return paramCommands[i].getName(); };

	this.getBrief = function(){ return briefCommand.getContent(); };
	this.getReturnDataType = function(){ return returnCommand ? returnCommand.getDataType() : false; };
    }

    /**
     * @class DOCJS.PropertyEntity
     * @param DOCJS.Block block
     * @param DOCJS.PropertyCommand property
     * @param DOCJS.MemberofCommand memberof
     * @param DOCJS.BriefCommand brief
     * @param DOCJS.DescriptionCommand description
     * @extends DOCJS.Entity
     */
    DOCJS.PropertyEntity = function(block,
				    propertyCommand,
				    memberofCommand,
				    briefCommand, // optional
				    descriptionCommand // optional
				   ){
	DOCJS.Entity.call(this,block);
	this.getName = function(){ return propertyCommand.getName(); };
	this.getClassName = function(){ return memberofCommand.getClassName(); };
	this.getDataType = function(){ return propertyCommand.getDataType(); };
	this.getBrief = function(){ return briefCommand ? briefCommand.getContent() : false; };
	this.getDescription = function(){ return descriptionCommand ? descriptionCommand.getContent() : false; };
    }

    /**
     * @class DOCJS.TodoEntity
     * @param DOCJS.Block block
     * @param DOCJS.TodoCommand todoCommand
     * @extends DOCJS.Entity
     */
    DOCJS.TodoEntity = function(block,todoCommand){
	DOCJS.Entity.call(this,block);
	this.getContent = function(){ return todoCommand.getContent(); };
	this.setEntity = function(e){ entity = e; };
	this.getLine = function(){ return todoCommand.getBlock().lineNumber; };
    }

    /**
     * @class DOCJS.ClassEntity
     * @param DOCJS.Block block
     * @param DOCJS.ClassCommand classCommand
     * @param DOCJS.ParamCommand paramCommand
     * @param DOCJS.ExtendsCommand extendsCommand
     * @param DOCJS.BriefCommand briefCommand
     * @param DOCJS.DescriptionCommand descriptionCommand
     * @extends DOCJS.Entity
     */
    DOCJS.ClassEntity = function(block,
				 classCommand,
				 paramCommands,
				 extendsCommand, // optional
				 briefCommand, // optional
				 descriptionCommand, // optional
				 exampleCommands){ // optional
	if(!(briefCommand instanceof DOCJS.BriefCommand) && typeof(briefCommand)!="undefined"){
	    throw new Error("Argument 4 must be BriefCommand or undefined, got "+typeof(briefCommand));
	}
	var methodEntities = [];
	var propertyEntities = [];
	DOCJS.Entity.call(this,block);
	this.getName = function(){ return classCommand.getName(); };

	this.numMethods = function(){ return methodEntities.length; };
	this.addMethod = function(m){ methodEntities.push(m); };
	this.getMethod = function(i){ return methodEntities[i]; };

	// Constructor params
	this.numParams = function(){ return paramCommands.length; };
	this.getParamDataType = function(i){ return paramCommands[i].getDataType(); };
	this.getParamName = function(i){ return paramCommands[i].getName(); };
	this.addParam = function(p){ paramCommands.push(p); };

	this.getExtendedClassName = function(){ return extendsCommand ? extendsCommand.getClassName() : false; };

	this.numProperties = function(){ return propertyEntities.length; };
	this.addProperty = function(m){ propertyEntities.push(m); };
	this.getPropertyName = function(i){ return propertyEntities[i].getName(); };
	this.getPropertyDataType = function(i){ return propertyEntities[i].getDataType(); };
	this.getPropertyBrief = function(i){ return propertyEntities[i].getBrief(); };
	this.getBrief = function(){ return briefCommand ? briefCommand.getContent() : false; };

	this.numExamples = function(){ return exampleCommands ? exampleCommands.length : 0; };
	this.getExampleText = function(i){ return exampleCommands[i].getContent(); };
    }

    /**
     * @class DOCJS.PageEntity
     * @param DOCJS.Block block
     * @param DOCJS.PageCommand pageCommand
     * @param string content
     * @extends DOCJS.Entity
     */    
    DOCJS.PageEntity = function(block,pageCommand,content){
	var that = this;
	DOCJS.Entity.call(this,block);
	this.getName = function(){ return pageCommand.getName(); };
	this.getContent = function(){ return content; };
    }

    /**
     * @class DOCJS.Documentation
     */
    DOCJS.Documentation = function(){
	var name2class, name2entity, that = this;
	this.pages = [];
	this.classes = [];
	this.files = [];
	this.functions = [];
	this.library = false;
	this.todos = [];
	this.errors = [];
	this.methods = [];
	this.properties = [];
	this.update = function(){
	    name2entity = {};

	    // Classes
	    name2class = {};
	    var N = this.classes.length;
	    for(var i=0; i<N; i++){
		var c = this.classes[i];
		var n = c.getName();
		name2class[n] = c;
		name2entity[n] = c;
	    }

	    // Sort
	    var sortbyname = function(a,b){
		if(a.getName() > b.getName()) return 1;
		if(a.getName() < b.getName()) return -1;
		else return 0;
	    };
	    that.pages.sort(sortbyname);
	    that.classes.sort(sortbyname);
	    that.functions.sort(sortbyname);
	};
	this.nameToClass = function(name){
	    var c = name2class[name];
	    if(c) return c;
	    else return false;
	}
	this.nameToEntity = function(name){
	    var c = name2entity[name];
	    if(c) return c;
	    else return false;
	}

	function recurseInheritance(name,nameList){
	    nameList.push(name);
	    var c = that.nameToClass(name);
	    if(!c) return;
	    var extended = c.getExtendedClassName();
	    if(!extended) return;
	    recurseInheritance(extended,nameList);
	}
	this.getInheritanceList = function(classs){
	    var list = [];
	    recurseInheritance(classs.getName(),list);
	    return list;
	};
    };
    

    // Assembles Entity's out of Block's
    function makeEntities(blocks){
	var doc = new DOCJS.Documentation();

	// Assemble Entities
	for(var i=0; i<blocks.length; i++){
	    var entity, block = blocks[i];

	    // Find block type
	    if(block.page.length){ // Page
		// May only contain 1 @page command
		var pageCommand = block.page[0];
		var lines = block.getUnparsedLines2();
		var lines_array = [];
		for(var lineNumber in lines){
		    var line = lines[lineNumber];
		    lines_array.push(line);
		    block.markLineAsParsed(lineNumber);
		}
		var content = lines_array.join("\n");
		entity = new DOCJS.PageEntity([block],pageCommand,content);
		doc.pages.push(entity);
		
	    } else if(block.classs.length){ // Class
		// May only contain 1 @class command
		var entity = new DOCJS.ClassEntity([block],
						   block.classs[0],
						   block.param,
						   block.extends[0],
						   block.brief[0],
						   block.desc[0],
						   block.example);
		doc.classes.push(entity);

	    } else if(block.file.length){ // File

	    } else if(block.library.length){ // Library

		entity = new DOCJS.LibraryEntity([block],
						 block.library[0],
						 block.version[0],
						 block.brief[0],
						 block.desc[0]);
		doc.library = entity;

	    } else if(block.func.length){ // Function
		entity = new DOCJS.FunctionEntity([block],
						  block.func[0],
						  block.param,
						  block.ret[0],
						  block.brief[0],
						  block.desc[0],
						  block.example);
		doc.functions.push(entity);

	    } else if(block.method.length){ // Method
		if(block.memberof.length==1){
		    entity = new MethodEntity([block],
					      block.method[0],
					      block.memberof[0],
					      block.param,
					      block.brief[0],
					      block.ret[0]);
		    doc.methods.push(entity);
		}

		
	    } else if(block.property.length){ // Property
		if(block.memberof.length!=1)
		    doc.errors.push(new ErrorReport(block.filename,
						    block.lineNumber,
						    "A @property block requires exactly 1 @memberof command, got "+block.memberof.length+"."));
		else {
		    entity = new PropertyEntity([block],
						block.property[0],
						block.memberof[0],
						block.brief[0],
						block.desc[0]);
		    doc.properties.push(entity);
		}
	    }
		
	    // Check for todos
	    if(block.todo.length){
		for(var j=0; j<block.todo.length; j++){
		    var todo = new DOCJS.TodoEntity([block],block.todo[j]);
		    doc.todos.push(todo);
		    todo.setEntity(entity);
		}
	    }

	    // Make error for unparsed code
	    var unparsed = block.getUnparsedLines2(true);
	    var count = 0;
	    for (var k in unparsed) {
		if (unparsed.hasOwnProperty(k)){
		    ++count;
		    break;
		}
	    }
	    if(count){
		var message = "There was unparsed code:\n\n";
		for(var j in unparsed){
		    message += "Line "+j+": "+unparsed[j]+"\n";
		}
		doc.errors.push(new ErrorReport(block.filename,
						block.lineNumber,
						message));
	    }
	}

	doc.update();

	// Attach methods, properties to their classes
	for(var i=0; i<doc.methods.length; i++){
	    var m = doc.methods[i];
	    var c = doc.nameToClass(m.getClassName());
	    if(c)
		c.addMethod(m);
	    else
		doc.errors.push(new ErrorReport("",1,"Could not add method "+m.getName()+" to the class "+m.getClassName()+", could not find that class."));
	}
	for(var i=0; i<doc.properties.length; i++){
	    var p = doc.properties[i];
	    var c = doc.nameToClass(p.getClassName());
	    if(c)
		c.addProperty(p);
	    else
		doc.errors.push(new ErrorReport("",
						p.block.lineNumber,
						"Could not attach property "+p.getName()+" to the class "+p.getClassName()+" because it could not be found."));
	}

	return doc;
    }

    /**
     * @class DOCJS.Command
     * @param DOCJS.Block block
     */
    DOCJS.Command = function(block){
	if(!(block instanceof Block)) throw new Error("Argument block must be instance of Block");
	this.getBlock = function(){ return block; };
	this.setBlock = function(b){ block = b; };
    }

    /**
     * @class DOCJS.AuthorCommand
     * @param DOCJS.Block block
     * @param string content
     * @extends DOCJS.Command
     * @example
     * HEY
     * @endexample
     */
    DOCJS.AuthorCommand = function(block,content){
	DOCJS.Command.call(this,block);
	this.getContent = function(){ return content; };
	this.setContent = function(n){ content=n; };
    }
    DOCJS.AuthorCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines2();
	for(var j in lines){
	    var line = lines[j];
	    var result = line.match(/@author\s+(.*)$/);
	    if(result && result.length==2){
		var author = new DOCJS.AuthorCommand(block,result[1]);
		block.markLineAsParsed(j);
		commands.push(author);
	    }
	}
	return commands;
    }

    /**
     * @class DOCJS.BriefCommand
     * @param DOCJS.Block block
     * @param string content
     * @extends DOCJS.Command
     */
    DOCJS.BriefCommand = function(block,content){
	DOCJS.Command.call(this,block);
	this.getContent = function(){ return content; };
	this.setContent = function(c){ content=c; };
    }
    DOCJS.BriefCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines2();
	for(var j in lines){
	    var line = lines[j];

	    // @brief briefString
	    var result = line.match(/@brief\s+(.*)$/);
	    if(result && result.length==2){
		var command = new DOCJS.BriefCommand(block,result[1]);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    DOCJS.ClassCommand = function(block,name){
	DOCJS.Command.call(this,block);
	this.getName = function(){ return name; };
	this.setName = function(n){ name=n; };
    }
    DOCJS.ClassCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines2();
	for(var j in lines){
	    var line = lines[j];

	    // @class ClassNameInOneWord
	    var result = line.match(/@class\s+([^\s]*)$/);
	    if(result && result.length==2){
		var command = new DOCJS.ClassCommand(block,result[1]);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    DOCJS.DescriptionCommand = function(block,content){
	DOCJS.Command.call(this,block);
	this.getContent = function(){ return content; };
	this.setContent = function(n){ content=n; };
    }
    DOCJS.DescriptionCommand.parse = function(block,errors){
	var commands=[], src = block.getUnparsedLines().join("\n");
	var result = src.match(/((@description)|(@desc))\s+((.(?!@))*)/m)||[]; // anything but not followed by @
	if(result.length>=4 && result[4]!=""){
	    var content = result[4];
	    var command = new DOCJS.DescriptionCommand(block,content);
	    var contentLines = content.split("\n");
	    for(var i=0; i<contentLines.length; i++){
		var n = block.getLineNumber(contentLines[i]);
		block.markLineAsParsed(n);
	    }
	    commands.push(command);
	}
	return commands;
    }

    DOCJS.EventCommand = function(block,name,description){
	DOCJS.Command.call(this,block);
	description = description || "";
	this.getName = function(){ return name; };
	this.setName = function(n){ name=n; };
	this.getDescription = function(){ return description; };
	this.setDescription = function(s){ description=s; };
    }
    DOCJS.EventCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines2();
	for(var j in lines){
	    var line = lines[j];
	    
	    // @event name [description]
	    var result = line.match(/@event\s+([^\s]*)(\s+(.*)){0,1}$/);
	    if(result){
		var name = result[1];
		var desc;
		if(result.length>=3) desc = result[2];
		var command = new DOCJS.EventCommand(block,name,desc);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    DOCJS.ExampleCommand = function(block,content){
	DOCJS.Command.call(this,block);
	this.getContent = function(){ return content; };
    }
    DOCJS.ExampleCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines();
	var src = lines.join("\n");
	    
	// @example formattedText @endexample
	var result = src.match(/@example(([\s\S](?!(\\@endexample)))*)@endexample/);
	if(result){
	    var content = result[1];
	    var command = new DOCJS.ExampleCommand(block,content);
	    block.markChunkAsParsed(result[0]);
	    commands.push(command);
	}
	return commands;
    }

    DOCJS.ExtendsCommand = function(block,className){
	DOCJS.Command.call(this,block);
	this.getClassName = function(){ return className; };
    }
    DOCJS.ExtendsCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines2();
	for(var j in lines){
	    var line = lines[j];
	    
	    // @extends className
	    var result = line.match(/@extends\s+([^\s]*)/);
	    if(result){
		var name = result[1];
		var command = new DOCJS.ExtendsCommand(block,name);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    /**
     * @class DOCJS.FunctionCommand
     * @param DOCJS.Block block
     * @param string name
     * @param string description
     * @extends DOCJS.Command
     */
    DOCJS.FunctionCommand = function(block,name,description){
	if(typeof(name)!="string") throw new Error("Argument 2 must be string, "+typeof(name)+" given");
	DOCJS.Command.call(this,block);
	this.getName = function(){ return name; };
	this.setName = function(n){ name=n; };
	this.getDescription = function(){ return description; };
	this.setDescription = function(n){ description=n; };
    }
    DOCJS.FunctionCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines2();
	for(var j in lines){
	    var line = lines[j];

	    // @[function|fn] name [description]
	    var result = line.match(/((@function)|(@fn))\s+([^\s]+)(\s+(.*))?/);
	    if(result){
		var name = result[4];
		var desc;
		if(result.length>=6) desc = result[6];
		var command = new DOCJS.FunctionCommand(block,name,desc);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    DOCJS.MemberofCommand = function(block,className){
	DOCJS.Command.call(this,block);
	this.getClassName = function(){ return className; };
	this.setClassName = function(n){ className=n; };
    }
    DOCJS.MemberofCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines2();
	for(var j in lines){
	    var line = lines[j];
	    // @[memberof|memberOf] ClassName
	    var result = line.match(/(@memberOf)|(@memberof)\s+([^\s]*)$/);
	    if(result && result.length>=4){
		var classname = result[3];
		var command = new DOCJS.MemberofCommand(block,classname);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    DOCJS.LibraryCommand = function(block,libraryName){
	DOCJS.Command.call(this,block);
	this.getName = function(){ return libraryName; };
    }
    DOCJS.LibraryCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines2();
	for(var j in lines){
	    var line = lines[j];
	    // @[library|library] ClassName
	    var result = line.match(/@library\s+(.*)$/);
	    if(result){
		var libname = result[1];
		var command = new DOCJS.LibraryCommand(block,libname);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    DOCJS.MethodCommand = function(block,name){
	DOCJS.Command.call(this,block);
	this.getName = function(){ return name; };
	this.setName = function(n){ name=n; };
    }
    DOCJS.MethodCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines2();
	for(var j in lines){
	    var line = lines[j];

	    // @method methodName

	    var result = line.match(/@method\s+([^\s]*)$/);
	    if(result){
		var methodname = result[1];
		var command = new DOCJS.MethodCommand(block,methodname);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    DOCJS.PageCommand = function(block,name){
	DOCJS.Command.call(this,block);
	this.getName = function(){ return name; };
	this.setName = function(n){ name=n; };
    }
    DOCJS.PageCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines2();
	for(var j in lines){
	    var line = lines[j];

	    // @page PageTitleString
	    var result = line.match(/@page\s+(.*)$/);
	    if(result){
		var pagename = result[1];
		var command = new DOCJS.PageCommand(block,pagename);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    DOCJS.ParamCommand = function(block,dataType,name,description){
	DOCJS.Command.call(this,block);
	this.getName = function(){ return name; };
	this.getDataType = function(){ return dataType; };
	this.getDescription = function(){ return description ? description : false; };
    }
    DOCJS.ParamCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines2();
	for(var j in lines){
	    var line = lines[j];

		// @param dataType paramName [paramDescription]
	    var result = line.match(/@param\s+([^\s]*)\s+([^\s]+)(\s+(.*)){0,1}$/);
	    if(result){
		var dataType = result[1],
		paramName = result[2],
		desc;
		if(typeof(result[4])=="string" && result[4]!="") desc = result[4];
		var command = new DOCJS.ParamCommand(block,dataType,paramName,desc);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    DOCJS.PropertyCommand = function(block,datatype,name,desc){
	DOCJS.Command.call(this,block);
	this.getName = function(){ return name; };
	this.setName = function(n){ name=n; };
	this.getDataType = function(){ return datatype; };
    }
    DOCJS.PropertyCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines2();
	for(var j in lines){
	    var line = lines[j];

	    // @property dataType name [description]
	    var result = line.match(/@property\s+([^\s]*)\s+([^\s]*)\s*(.*){0,1}$/);
	    if(result){
		var dataType = result[1],
		name = result[2],
		desc; // optional
		if(typeof(result[3])=="string" && result[3]!="") desc = result[2];
		var command = new DOCJS.PropertyCommand(block,dataType,name,desc);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    DOCJS.PrototypeCommand = function(block,name){
	DOCJS.Command.call(this,block);
	this.getName = function(){ return name; };
	this.setName = function(n){ name=n; };
    }
    DOCJS.PrototypeCommand.parse = function(block,errors){
	return [];
    }

    DOCJS.ReturnCommand = function(block,dataType,description){
	DOCJS.Command.call(this,block);
	this.getDescription = function(){ return description; };
	this.setDescription = function(n){ description=n; };
	this.getDataType = function(){ return dataType; };
	this.setDataType = function(n){ dataType=n; };
    }
    DOCJS.ReturnCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines2();
	for(var j in lines){
	    var line = lines[j];

	    // @return dataType [description]
	    var result = line.match(/@return[s]{0,1}\s+([^\s]*)\s*(.*){0,1}$/);
	    if(result){
		var dataType = result[1],
		name = result[2],
		desc; // optional
		if(typeof(result[3])=="string" && result[3]!="") desc = result[2];
		var command = new DOCJS.ReturnCommand(block,dataType,name,desc);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    DOCJS.SeeCommand = function(block,text){
	DOCJS.Command.call(this,block);
	this.getText = function(){ return text; };
	this.setText = function(n){ text=n; };
    }
    DOCJS.SeeCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines2();
	for(var j in lines){
	    var line = lines[j];
	    
	    // @see text
	    var result = line.match(/@see\s+(.*)$/);
	    if(result){
		var text = result[1];
		var command = new DOCJS.SeeCommand(block,text);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    DOCJS.TodoCommand = function(block,content){
	DOCJS.Command.call(this,block);
	this.getContent = function(){ return content; };
	this.setContent = function(n){ content=n; };
    }
    DOCJS.TodoCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines2();
	for(var j in lines){
	    var line = lines[j];

	    // @todo [text]
	    var result = line.match(/@todo(\s+(.*))$/);
	    if(result){
		var text = result[1];
		var command = new DOCJS.TodoCommand(block,text);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    DOCJS.VersionCommand = function(block,content){
	DOCJS.Command.call(this,block);
	this.getContent = function(){ return content; };
    }
    DOCJS.VersionCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines2();
	for(var j in lines){
	    var line = lines[j];

	    // @version text
	    var result = line.match(/@version\s+(.*)$/);
	    if(result){
		var text = result[1];
		var command = new DOCJS.VersionCommand(block,text);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    // Parse blocks from a file
    function parseBlocks(src,file){
	var blockObjects = [];
	// (.(?!\*\/))* is negative lookahead, anything not followed by */
	var blocks = src.match(/\/\*\*\n(^(.(?!\*\/))*\n)+[\n\s\t]*\*\//gm) || [];
	for(var i=0; i<blocks.length; i++){

	    // find line number
	    var idx = src.indexOf(blocks[i]);
	    var lineNumber = (src.substr(0,idx).match(/\n/g)||[]).length + 1;

	    var raw = blocks[i]+"";

	    // remove first and last slash-stars
	    blocks[i] = blocks[i]
		.replace(/\/\*\*[\n\t\r]*/,"")
		.replace(/[\n\t\r]*\*\/$/,"");

	    // Remove starting star + spaces
	    var lines = blocks[i].split("\n");
	    for(var j=0; j<lines.length; j++)
		lines[j] = lines[j].replace(/^[\s\t]*\*[\s\t]*/,"");

	    // Create block
	    var block = new Block(lines.join("\n").replace(/[\n\s\t]*$/,""),raw,lineNumber);
	    block.filename = file;
	    var errors = [];

	    // Parse commands from block
	    block.author =   DOCJS.AuthorCommand.parse(block,errors);
	    block.brief =    DOCJS.BriefCommand.parse(block,errors);
	    block.classs =   DOCJS.ClassCommand.parse(block,errors);
	    block.desc =     DOCJS.DescriptionCommand.parse(block,errors);
	    block.event =    DOCJS.EventCommand.parse(block,errors);
	    block.example=   DOCJS.ExampleCommand.parse(block,errors);
	    block.extends=   DOCJS.ExtendsCommand.parse(block,errors);
	    block.func =     DOCJS.FunctionCommand.parse(block,errors);
	    block.library =  DOCJS.LibraryCommand.parse(block,errors);
	    block.memberof = DOCJS.MemberofCommand.parse(block,errors);
	    block.method =   DOCJS.MethodCommand.parse(block,errors);
	    block.page =     DOCJS.PageCommand.parse(block,errors);
	    block.param =    DOCJS.ParamCommand.parse(block,errors);
	    block.property = DOCJS.PropertyCommand.parse(block,errors);
	    block.proto =    DOCJS.PrototypeCommand.parse(block,errors);
	    block.ret =      DOCJS.ReturnCommand.parse(block,errors);
	    block.see =      DOCJS.SeeCommand.parse(block,errors);
	    block.todo =     DOCJS.TodoCommand.parse(block,errors);
	    block.version =  DOCJS.VersionCommand.parse(block,errors);

	    blockObjects.push(block);
	} 
	return blockObjects;
    };

    function updateHTML(doc){

	setupLayout();

	// Library info
	if(doc.library){
	    $("#libtitle").html(doc.library.getName());
	    $("#libversion").html(doc.library.getVersion());
	    $("#libdesc").html(doc.library.getBrief());
	} else {
	    $("#libtitle").html("Untitled");
	    $("#libversion").html("0.0.0");
	    $("#libdesc").html("An untitled library doc");
	}
	
	// Pages
	if(doc.pages.length > 0){
	    var links = [], contents = [];
	    for(var i=0; i<doc.pages.length; i++){
		var page = doc.pages[i];
		var $sec = $("<section id=\"pages-"+toNice(page.getName())+"\"></section>")
		    .append($("<h2>"+page.getName()+"</h2>"))
		    .append($(markDown2HTML(page.getContent())));
		
		contents.push($sec);
		links = $("<a href=\"#pages-"+toNice(page.getName())+"\">"+page.getName()+"</a>");
	    }
	    createSection("pages","Pages",contents);
	    createMenuList("pages","Pages",links);
	}

	// Functions
	if(doc.functions.length > 0){
	    var links = [], contents = [];
	    for(var i=0; i<doc.functions.length; i++){
		var f = doc.functions[i];
		var $sec = $("<section id=\"functions-"+toNice(f.getName())+"\"></section>")
		    .append($("<h2>"+f.getName()+"</h2>"));

		// Brief
		if(f.getBrief()){
		    $sec.append( $("<p class=\"brief\">"+f.getBrief()+"</p>"));
		}

		// Description
		$sec.append($("<h3>Description</h3>"));
		var params = [];
		for(var k=0; k<f.numParams(); k++){
		    params.push("<span class=\"datatype\">"+f.getParamDataType(k)+"</span> <span>" + f.getParamName(k) + "</span>");
		}
		$sec.append($("<span class=\"datatype\">"+
			      (f.getReturnDataType() ? f.getReturnDataType() : "")+
			      "</span> <span>" + 
			      f.getName() + 
			      " ( " + params.join(" , ") + " ) </span>"));
		

		// Description
		if(f.getDescription()){
		    $sec.append( $("<p class=\"description\">"+f.getDescription()+"</p>"));
		}

		// Parameters
		if(f.numParams()>0){
		    $sec.append($("<h3>Parameters</h3>"));
		    var $params = $("<table></table>").addClass("member_overview");
		    for(var k=0; k<f.numParams(); k++){
			$params.append("<tr><td class=\"datatype\">"+(f.getParamDataType(k))+"</td><td>" + f.getParamName(k) + "</td><td class=\"brief\">"+(f.getParamDescription(k) ? f.getParamDescription(k) : "")+"</td></tr>");
		    }
		    $sec.append($params);
		}

		// Return value
		if(f.getReturnDescription()){
		    $sec.append($("<h3>Return value</h3>"));
		    $sec.append("<p>"+f.getReturnDescription(k)+"</p>");
		}

		// Examples
		if(f.numExamples()){
		    for(var j=0; j<f.numExamples(); j++){
			// Example
			$sec.append($("<h3>Example "+(j+1)+"</h3><div>"+markDown2HTML(f.getExampleText(j))+"</div>"));
		    }
		}

		contents.push($sec);
		links.push($("<a href=\"#functions-"+toNice(f.getName())+"\">"+f.getName()+"</a>"));
	    }
	    createSection("functions","Functions",contents);
	    createMenuList("functions","Functions",links);
	}
	

	// Classes
	if(doc.classes.length > 0){
	    var links = [], contents = [];
	    for(var i=0; i<doc.classes.length; i++){
		var c = doc.classes[i];
		
		var $sec = $("<section id=\"classes-"+toNice(c.getName())+"\"></section>");
		$sec.append($("<h2>"+c.getName()+"</h2>"));

		// Inheritance list
		var extendsList = doc.getInheritanceList(c);
		extendsList.shift();
		if(extendsList.length >= 1){
		    for(var j=0; j<extendsList.length; j++)
			extendsList[j] = nameToLink(extendsList[j]);
		    $sec.append($("<p>Extends "+extendsList.join(" → ")+"</p>"));
		}

		// Brief
		if(c.getBrief())
		    $sec.append($("<p>"+c.getBrief()+"</p>"));

		// Constructor
		var args = [];
		for(var j=0; j<c.numParams(); j++)
		    args.push("<span class=\"datatype\">"+nameToLink(c.getParamDataType(j))+"</span> " + c.getParamName(j));
		$sec.append($("<h3>Constructor</h3>"));
		$sec.append($("<p>"+c.getName() + " ( " + args.join(" , ")+" )</p>"));

		// Method overview table
		var numMethods = c.numMethods();
		if(numMethods>0){
		    $sec.append($("<h3>Methods</h3>"));
		    var $methods = $("<table></table>").addClass("member_overview");
		    for(var k=0; k<numMethods; k++){
			var method = c.getMethod(k);
			var params = [];
			for(var k=0; k<method.numParams(); k++){
			    params.push("<span class=\"datatype\">"+nameToLink(method.getParamDataType(k))+"</span>" + " " + method.getParamName(k));
			}
			$methods
			    .append($("<tr><td class=\"datatype\">"+(method.getReturnDataType() ? method.getReturnDataType() : "")+"</td><td>"
				      + method.getName() + " ( " +params.join(" , ")+ " )</td></tr>"))
			    .append($("<tr><td></td><td class=\"brief\">"+method.getBrief()+"</td></tr>"));
		    }
		    $sec.append($methods);
		}
		
		// Properties
		var numProperties = c.numProperties();
		if(numProperties>0){
		    $sec.append($("<h3>Properties</h3>"));
		    var $properties = $("<table></table>").addClass("member_overview");
		    for(var k=0; k<numProperties; k++){
			$properties.append("<tr><td class=\"datatype\">"+(c.getPropertyDataType(k))+"</td><td>" + c.getPropertyName(k) + "</td><td class=\"brief\">"+(c.getPropertyBrief(k) ? c.getPropertyBrief(k) : "")+"</td></tr>");
		    }
		    $sec.append($properties);
		}

		// Examples
		if(c.numExamples()){
		    for(var j=0; j<c.numExamples(); j++){
			// Example
			$sec.append($("<h3>Example "+(j+1)+"</h3><div>"+markDown2HTML(c.getExampleText(j))+"</div>"));
		    }
		}

		contents.push($sec);
		links.push($("<a href=\"#classes-"+toNice(c.getName())+"\">"+c.getName()+"</a>"));
	    }
	    createSection("classes","Classes",contents);
	    createMenuList("classes","Classes",links);
	}

	// Todos
	if(doc.todos.length > 0){
	    var links = [], contents = [];
	    for(var i=0; i<doc.todos.length; i++){
		var todo = doc.todos[i];
		var $sec = $("<div id=\"todos-"+todo.id+"\"></div>")
		    .append($("<h2>Line "+todo.getLine()+"</h2>"))
		    .append($("<pre>"+todo.getContent()+"</pre>"));
		contents.push($sec);
	    }
	    createSection("todos","Todos ("+todos.length+")",contents);
	    createMenuList("todos","Todos ("+todos.length+")",links);
	}

	// Errors
	if(doc.errors.length > 0){
	    var links = [], contents = [];
	    for(var i=0; i<doc.errors.length; i++){
		var error = doc.errors[i];
		var $sec = $("<div id=\"errors-"+error.id+"\"></div>")
		    .append($("<h2>Error "+error.id+"</h2>"))
		    .append($("<pre>"+error.message+"</pre>"));
		contents.push($sec);
	    }
	    createSection("errors","Errors ("+doc.errors.length+")",contents);
	    createMenuList("errors","Errors ("+doc.errors.length+")",links);
	}

	
	function setupLayout(){
	    // Setup basic page layout
	    $("body")
		.html("")
		.append("<article>\
<nav></nav>\
<footer>\
<a href=\"http://github.com/schteppe/doc.js\">github.com/schteppe/doc.js</a>\
</footer>\
</article>");

	    // Set repos header
	    $("nav")
		.append("<h1 id=\"libtitle\">"+options.title+"</h1>"+"<sup id=\"libversion\"></sup>")
		.append("<p id=\"libdesc\">"+options.description+"</p>");
	}


	// Convert a name to a link, or just return the input name
	function nameToLink(name){
	    var r = name;
	    var entity = doc.nameToEntity(name);
	    if(entity){
		if(entity instanceof DOCJS.ClassEntity)
		    r = "<a href=\"#classes-"+toNice(name)+"\">"+name+"</a>";
	    }
	    return r;
	}

	function markDown2HTML(m){
	    if(typeof(Markdown)!="undefined"){
		var converter = Markdown.getSanitizingConverter();
		return converter.makeHtml(m);
	    } else
	    return "<div>"+m+"</div>"; // todo
	}

	// Create a section e.g. Classes, Functions, etc
	function createSection(id,title,$content){
	    var $title =  $("<h1>"+title+"</h1>");
	    var $section = $("<section id=\""+id+"\"></section>");
	    $section
		.append($title);
	    if($content.length)
		for(var i=0; i<$content.length; i++)
		    $section.append($content[i]);
	    else
		$section.append($content);
	    $("article").append($section);
	}
	
	// Create corresp. menu list
	function createMenuList(id,title,items){
	    var $ul = $("<ul></ul>");
	    $("nav")
		.append("<h2><a href=\"#"+id+"\">"+title+"</a></h2>")
		.append($ul);
	    for(var i=0; i<items.length; i++){
		$li = $("<li></li>");
		$li.append(items[i]);
		$ul.append($li);
	    }
	}
    }
    
    function loadBlocks(urls,callback){
	// Get the files
	var numLoaded = 0;
	for(var i=0; i<urls.length; i++){
	    var file = urls[i];
	    $.ajax({
		url:urls[i],
		dataType:'text',
		async:true,
		success:function(data){
		    var blocks = parseBlocks(data,file);
		    numLoaded++;
		    if(numLoaded==urls.length)
			callback(blocks);
		},
		error:function(){
		    // todo
		    numLoaded++;
		    if(numLoaded==urls.length)
			callback(blocks);
		}
	    });
	}
    }
};

