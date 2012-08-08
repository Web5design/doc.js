var DOCJS = {};

DOCJS.Generate = function(urls,opt){

    // Options
    opt = opt || {};
    var options = {
	title:"Hello World!", // Should these be fetched from the blocks?
	description:"My first Doc.js documentation"
    };
    $.extend(options,opt);
    
    setupLayout();
    loadBlocks(urls,function(blocks){
	var entities = makeEntities(blocks);
	updateHTML(entities);
    });

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
	    .append("<h1>"+options.title+"</h1>")
	    .append("<p>"+options.description+"</p>");
    }

    // Utility functions
    function trim(s){ return s.replace(/^\s\s*/, '').replace(/\s\s*$/, ''); }
    function ltrim(s){ return s.replace(/^\s+/,''); }
    function rtrim(s){ return s.replace(/\s+$/,''); }
    function fulltrim(s){ return s.replace(/(?:(?:^|\n)\s+|\s+(?:$|\n))/g,'').replace(/\s+/g,' '); }

    // A comment block in the code.
    function Block(src){

	var lines, parsedLines = [], that=this;
	function splitLines(){
	    if(!lines) lines = src.split("\n");
	}

	this.filename = "";
	this.src = src;
	this.lineNumber = 1;

	this.author = [];   // @author
	this.brief = [];    // @brief
	this.classs = [];   // @class
	this.desc = [];     // @desc, @description
	this.event = [];    // @event
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

	this.markLineAsParsed = function(lineNumber){
	    if(!that.lineIsParsed(lineNumber))
		parsedLines.push(lineNumber);
	};
	this.lineIsParsed = function(lineNumber){
	    return parsedLines.indexOf(lineNumber)!=-1;
	};
	this.getLine = function(lineNumber){
	    splitLines();
	    return lines[lineNumber];
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
    }

    function ErrorReport(filename,lineNumber,message){
	this.lineNumber = lineNumber;
	this.file = filename;
	this.message = message;
    }

    // An Entity is a set of Command's
    // The Entities corresponds to a thing that is viewed to the user, eg. Function, Class etc.
    function Entity(blocks){
	this.blocks = blocks; // where it was defined
    }

    function FileEntity(file,fileCommand){
	Entity.call(this,file);
	this.getName = function(){ return fileCommand.getName(); };
    }

    function FunctionEntity(file,
			    functionCommand,
			    paramCommands,
			    returnCommand){
	Entity.call(this,file);
	this.getName = function(){ return functionCommand.getName(); };
	this.getReturn = function(){ return ret; };
	this.setReturn = function(r){ ret=r; };
	this.numParams = function(){ return paramCommands.length; };
	this.getParamDataType = function(i){ return paramCommands[i].getDataType(); };
	this.getParamName = function(i){ return paramCommands[i].getName(); };
	this.addParam = function(p){ paramCommands.push(p); };
    }

    function MethodEntity(file,
			  methodCommand,
			  memberofCommand,
			  paramCommands,
			  briefCommand,
			  returnCommand){
	Entity.call(this,file);
	this.getName = function(){ return methodCommand.getName(); };
	this.getClassName = function(){ return memberofCommand.getClassName(); };
	this.numParams = function(){ return paramCommands.length; };
	this.getBrief = function(){ return briefCommand.getContent(); };
	this.getReturnDataType = function(){ return returnCommand ? returnCommand.getDataType() : false; };
    }

    function PropertyEntity(file,
			    propertyCommand,
			    memberofCommand,
			    briefCommand,
			    descriptionCommand){
	Entity.call(this,file);
	this.getName = function(){ return propertyCommand.getName(); };
	this.getClassName = function(){ return memberofCommand.getClassName(); };
	this.getDataType = function(){ return propertyCommand.getDataType(); };
	this.getBrief = function(){ return briefCommand.getContent(); };
    }
    
    function ClassEntity(file,
			 classCommand,
			 paramCommands,
			 briefCommand,
			 descriptionCommand){
	if(!(briefCommand instanceof BriefCommand) && !(typeof briefCommand!="undefined"))
	    throw new Error("Arg4 must be BriefCommand");
	var methodEntities = [];
	var propertyEntities = [];
	Entity.call(this,file);
	this.getName = function(){ return classCommand.getName(); };

	this.numMethods = function(){ return methodEntities.length; };
	this.addMethod = function(m){ methodEntities.push(m); };
	this.getMethod = function(i){ return methodEntities[i]; };

	this.numProperties = function(){ return propertyEntities.length; };
	this.addProperty = function(m){ propertyEntities.push(m); };
	this.getPropertyName = function(i){ return propertyEntities[i].getName(); };
	this.getPropertyDataType = function(i){ return propertyEntities[i].getDataType(); };
	this.getPropertyBrief = function(i){ return propertyEntities[i].getBrief(); };
	this.getBrief = function(){ return briefCommand ? briefCommand.getContent() : false; };
    }
    
    function PageEntity(file,pageCommand,content){
	var that = this;
	Entity.call(this,file);
	this.getName = function(){ return pageCommand.getName(); };
	this.getContent = function(){ return content; };
	this.toHTML = function(){
	    return "<div>"+that.getContent()+"</div>"; // todo
	}
    }

    // Assembles Entity's out of Block's
    function makeEntities(blocks){
	// Entities
	var pages=[],
	classes=[],
	files = [],
	functions=[],
	todos=[],
	errors=[],
	methods = [],
	properties = [],
	name2class={};

	// Assemble Entities
	for(var i=0; i<blocks.length; i++){
	    var entity, block = blocks[i];

	    // Find block type
	    if(block.page.length){ // Page
		// May only contain 1 @page command
		var pageCommand = block.page[0];
		var lines = block.getUnparsedLines();
		var content;
		if(lines.length==1){ content = lines; }
		else if(lines.length>1) content = lines.join("<br/>");
		pages.push(new PageEntity([block],pageCommand,content));
		
	    } else if(block.classs.length){ // Class
		// May only contain 1 @class command
		var c = new ClassEntity([block],
					block.classs[0],
					block.param,
					block.brief[0],
					block.desc[0]);
		classes.push(c);
		name2class[c.getName()] = c;

	    } else if(block.file.length){ // File

	    } else if(block.func.length){ // Function
		// May only contain 1 @function command
		functions.push(new FunctionEntity([block],
						  block.func[0],
						  block.param,
						  block.ret[0]));

	    } else if(block.method.length){ // Method
		if(block.memberof.length==1)
		    methods.push(new MethodEntity([block],
						  block.method[0],
						  block.memberof[0],
						  block.param,
						  block.brief[0],
						  block.ret[0]));
	    } else if(block.property.length){
		properties.push(new PropertyEntity([block],
						   block.property[0],
						   block.memberof[0],
						   block.brief[0],
						   block.desc[0]));
	    }
		
	    // Check for todos
	    if(block.todo){
		
	    }
	}

	// Attach methods, properties to their classes
	for(var i=0; i<methods.length; i++){
	    var m = methods[i];
	    var c = name2class[m.getClassName()];
	    c.addMethod(m);
	}
	for(var i=0; i<properties.length; i++){
	    var p = properties[i];
	    var c = name2class[p.getClassName()];
	    c.addProperty(p);
	}

	return {
	    pages : pages,
	    classes : classes,
	    files : files,
	    functions : functions,
	    errors : errors,
	    todos : todos,
	};
    }

    // A parsed command
    function Command(block){
	if(!(block instanceof Block)) throw new Error("Argument block must be instance of Block");
	this.getBlock = function(){ return block; };
	this.setBlock = function(b){ block = b; };
    }

    function AuthorCommand(block,content){
	Command.call(this,block);
	this.getContent = function(){ return content; };
	this.setContent = function(n){ content=n; };
    }
    AuthorCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines();
	for(var j=0; j<lines.length; j++){
	    var line = lines[j];
	    /**
	     * @author authorString
	     */
	    var result = line.match(/@author\s+(.*)$/);
	    if(result && result.length==2){
		var author = new AuthorCommand(block,result[1]);
		block.markLineAsParsed(j);
		commands.push(author);
	    }
	}
	return commands;
    }

    function BriefCommand(block,content){
	Command.call(this,block);
	this.getContent = function(){ return content; };
	this.setContent = function(c){ content=c; };
    }
    BriefCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines();
	for(var j=0; j<lines.length; j++){
	    var line = lines[j];
	    /**
	     * @brief briefString
	     */
	    var result = line.match(/@brief\s+(.*)$/);
	    if(result && result.length==2){
		var command = new BriefCommand(block,result[1]);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    function ClassCommand(block,name){
	Command.call(this,block);
	this.getName = function(){ return name; };
	this.setName = function(n){ name=n; };
    }
    ClassCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines();
	for(var j=0; j<lines.length; j++){
	    var line = lines[j];
	    /**
	     * @class ClassNameInOneWord
	     */
	    var result = line.match(/@class\s+([^\s]*)/);
	    if(result && result.length==2){
		var command = new ClassCommand(block,result[1]);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    function DescriptionCommand(block,content){
	Command.call(this,block);
	this.getContent = function(){ return content; };
	this.setContent = function(n){ content=n; };
    }
    DescriptionCommand.parse = function(block,errors){
	var commands=[], src = block.getUnparsedLines().join("\n");
	var result = src.match(/((@description)|(@desc))\s+((.(?!@))*)/m)||[]; // anything but not followed by @
	if(result.length>=4){
	    var command = new DescriptionCommand(block,result[4]);
	    commands.push(command);
	}
	return commands;
    }

    function EventCommand(block,name,description){
	Command.call(this,block);
	description = description || "";
	this.getName = function(){ return name; };
	this.setName = function(n){ name=n; };
	this.getDescription = function(){ return description; };
	this.setDescription = function(s){ description=s; };
    }
    EventCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines();
	for(var j=0; j<lines.length; j++){
	    var line = lines[j];
	    /**
	     * @event name [description]
	     */
	    var result = line.match(/@event\s+([^\s]*)(\s+(.*)){0,1}$/);
	    if(result){
		var name = result[1];
		var desc;
		if(result.length>=3) desc = result[2];
		var command = new EventCommand(block,name,desc);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    function FunctionCommand(block,name,description){
	Command.call(this,block);
	this.getName = function(){ return name; };
	this.setName = function(n){ name=n; };
	this.getDescription = function(){ return description; };
	this.setDescription = function(n){ description=n; };
    }
    FunctionCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines();
	for(var j=0; j<lines.length; j++){
	    var line = lines[j];
	    /**
	     * @[function|fn] name [description]
	     */
	    var result = line.match(/@function|fn\s+([^\s]*)(\s+(.*)){0,1}$/);
	    if(result){
		var name = result[1];
		var desc;
		if(result.length>=3) desc = result[3];
		var command = new FunctionCommand(block,name,desc);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    function MemberofCommand(block,className){
	Command.call(this,block);
	this.getClassName = function(){ return className; };
	this.setClassName = function(n){ className=n; };
    }
    MemberofCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines();
	for(var j=0; j<lines.length; j++){
	    var line = lines[j];
	    /**
	     * @[memberof|memberOf] ClassName
	     */
	    var result = line.match(/(@memberOf)|(@memberof)\s+([^\s]*)/);
	    if(result && result.length>=4){
		var classname = result[3];
		var command = new MemberofCommand(block,classname);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    function MethodCommand(block,name){
	Command.call(this,block);
	this.getName = function(){ return name; };
	this.setName = function(n){ name=n; };
    }
    MethodCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines();
	for(var j=0; j<lines.length; j++){
	    var line = lines[j];
	    /**
	     * @method methodName
	     */
	    var result = line.match(/@method\s+([^\s]*)/);
	    if(result){
		var methodname = result[1];
		var command = new MethodCommand(block,methodname);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    function PageCommand(block,name){
	Command.call(this,block);
	this.getName = function(){ return name; };
	this.setName = function(n){ name=n; };
    }
    PageCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines();
	for(var j=0; j<lines.length; j++){
	    var line = lines[j];
	    /**
	     * @page PageTitleString
	     */
	    var result = line.match(/@page\s+(.*)$/);
	    if(result){
		var pagename = result[1];
		var command = new PageCommand(block,pagename);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    function ParamCommand(block,dataType,name,description){
	Command.call(this,block);
	this.getName = function(){ return name; };
	this.setName = function(n){ name=n; };
	this.getDataType = function(){ return dataType; };
	this.setDataType = function(n){ dataType=n; };
	this.getDescription = function(){ return description; };
	this.setDescription = function(n){ description=n; };
    }
    ParamCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines();
	for(var j=0; j<lines.length; j++){
	    var line = lines[j];
	    /**
	     * @param dataType paramName [paramDescription]
	     */
	    var result = line.match(/@param\s+([^\s]*)\s+([^\s]*)\s+(.*)$/);
	    if(result){
		var dataType = result[0],
		paramName = result[1],
		desc;
		if(typeof(result[2])=="string" && result[2]!="") desc = result[2];
		var command = new ParamCommand(block,dataType,paramName,desc);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    function PropertyCommand(block,datatype,name,desc){
	Command.call(this,block);
	this.getName = function(){ return name; };
	this.setName = function(n){ name=n; };
	this.getDataType = function(){ return datatype; };
    }
    PropertyCommand.parse = function(block,errors){
	var commands = [], lines = block.getUnparsedLines();
	for(var j=0; j<lines.length; j++){
	    var line = lines[j];
	    /**
	     * @property dataType name [description]
	     */
	    var result = line.match(/@property\s+([^\s]*)\s+([^\s]*)\s*(.*){0,1}$/);
	    if(result){
		var dataType = result[1],
		name = result[2],
		desc; // optional
		if(typeof(result[3])=="string" && result[3]!="") desc = result[2];
		var command = new PropertyCommand(block,dataType,name,desc);
		block.markLineAsParsed(j);
		commands.push(command);
	    }
	}
	return commands;
    }

    function PrototypeCommand(block,name){
	Command.call(this,block);
	this.getName = function(){ return name; };
	this.setName = function(n){ name=n; };
    }
    PrototypeCommand.parse = function(block,errors){
	return [];
    }

    function ReturnCommand(block,dataType,description){
	Command.call(this,block);
	this.getDescription = function(){ return description; };
	this.setDescription = function(n){ description=n; };
	this.getDataType = function(){ return dataType; };
	this.setDataType = function(n){ dataType=n; };
    }
    ReturnCommand.parse = function(block,errors){
/*		// @return
		var result = line.match(/@return|returns.*$/);
		if(result){
		    // Check ok
		    block.ret.push(result);
		}

*/
	return [];
    }

    function SeeCommand(block,name){
	Command.call(this,block);
	this.getName = function(){ return name; };
	this.setName = function(n){ name=n; };
    }
    SeeCommand.parse = function(block,errors){
	return [];
    }

    function TodoCommand(block,name){
	Command.call(this,block);
	this.getName = function(){ return name; };
	this.setName = function(n){ name=n; };
    }
    TodoCommand.parse = function(block,errors){
	return [];
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

	    // remove first and last slash-stars
	    blocks[i] = blocks[i]
		.replace(/\/\*\*[\n\t\r]*/,"")
		.replace(/[\n\t\r]*\*\/$/,"");

	    // Remove starting star + spaces
	    var lines = blocks[i].split("\n");
	    for(var j=0; j<lines.length; j++)
		lines[j] = lines[j].replace(/^[\s\t]*\*[\s\t]*/,"");

	    // Create block
	    var block = new Block(lines.join("\n"));
	    block.lineNumber = lineNumber;
	    block.filename = file;
	    var errors = [];

	    // Parse commands from block
	    block.author =   AuthorCommand.parse(block,errors);
	    block.brief =    BriefCommand.parse(block,errors);
	    block.classs =   ClassCommand.parse(block,errors);
	    block.event =    EventCommand.parse(block,errors);
	    block.func =     FunctionCommand.parse(block,errors);
	    block.memberof = MemberofCommand.parse(block,errors);
	    block.method =   MethodCommand.parse(block,errors);
	    block.page =     PageCommand.parse(block,errors);
	    block.param =    ParamCommand.parse(block,errors);
	    block.property = PropertyCommand.parse(block,errors);
	    block.proto =    PrototypeCommand.parse(block,errors);
	    block.ret =      ReturnCommand.parse(block,errors);
	    block.see =      SeeCommand.parse(block,errors);
	    block.todo =     TodoCommand.parse(block,errors);
	    block.desc =     DescriptionCommand.parse(block,errors);

	    blockObjects.push(block);
	} 
	return blockObjects;
    };

    function updateHTML(entities){
	var classes = entities.classes,
	files = entities.files,
	pages = entities.pages,
	functions = entities.functions,
	errors = entities.errors,
	todos = entities.todos;

	var name2class = {};

	// Register hash for datatypes
	for(var i=0; i<classes.length; i++){
	    name2class[classes[i].getName()] = classes[i];
	}
	
	// Sort
	var sortbyname=function(a,b){
	    if(a.getName() > b.getName()) return 1;
	    if(a.getName() < b.getName()) return -1;
	    else return 0;
	};
	pages.sort(sortbyname);
	classes.sort(sortbyname);
	functions.sort(sortbyname);
	
	function datatype2link(name){
	    if(name2class[name])
		return "<a href=\"#"+name+"\">"+name+"</a>";
	    else
		return name;
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
	function createMenuList(title,items){
	    var $ul = $("<ul></ul>");
	    $("nav")
		.append("<h2>"+title+"</h2>")
		.append($ul);
	    for(var i=0; i<items.length; i++){
		$li = $("<li></li>");
		$li.append(items[i]);
		$ul.append($li);
	    }
	}
	
	// Pages
	if(pages.length > 0){
	    var links = [], contents = [];
	    for(var i=0; i<pages.length; i++){
		var page = pages[i];
		var $sec = $("<section id=\"pages-"+page.getName()+"\"></section>")
		    .append($("<h2>"+page.getName()+"</h2>"))
		    .append($(page.toHTML()));
		
		contents.push($sec);
		links = $("<a href=\"#pages-"+page.getName()+"\">"+page.getName()+"</a>");
	    }
	    createSection("pages","Pages",contents);
	    createMenuList("Pages",links);
	}

	// Functions
	if(functions.length > 0){
	    var links = [], contents = [];
	    for(var i=0; i<functions.length; i++){
		var f = functions[i];
		var $sec = $("<section id=\"functions-"+f.getName()+"\"></section>")
		    .append($("<h2>"+f.getName()+"</h2>"));
		contents.push($sec);
		links = $("<a href=\"#functions-"+f.getName()+"\">"+f.getName()+"</a>");
	    }
	    createSection("functions","Functions",contents);
	    createMenuList("Functions",links);
	}
	
	// Classes
	if(classes.length > 0){
	    var links = [], contents = [];
	    for(var i=0; i<classes.length; i++){
		var c = classes[i];
		var $sec = $("<section id=\"classes-"+c.getName()+"\"></section>");
		$sec.append($("<h2>"+c.getName()+"</h2>"));

		// Constructor
		var args = []; // todo
		$sec.append($("<h3>Constructor</h3>"));
		$sec.append($("<p>"+c.getName() + " ( " + args.join(" , ")+" )</p>"));

		// Method overview table
		var numMethods = c.numMethods();
		if(numMethods>0){
		    $sec.append($("<h3>Methods</h3>"));
		    var $methods = $("<table></table>")
			.addClass("member_overview");
		    for(var k=0; k<numMethods; k++){
			var method = c.getMethod(k);
			var params = [];
			for(var k=0; k<method.numParams(); k++){
			    var param = method.getParameter(k);
			    params.push("<span class=\"datatype\">"+param.getDataType()+"</span>" + " " + param.getName());
			}
			$methods
			    .append($("<tr><td class=\"datatype\">"+(method.getReturnDataType() ? method.getReturnDataType() : "")+"</td><td>"
				      + method.getName() + " ( " +params.join(" , ")+ " )</td></tr>"))
			    .append($("<tr><td></td><td class=\"brief\">"+method.getBrief()+"</td></tr>"));
			/*
			  if(m.returnvalue && m.returnvalue.type && m.returnvalue.brief)
			  $methods.append("<tr><td></td><td class=\"brief\">Returns: "+m.returnvalue.brief+"</td></tr>");
			*/
		    }
		    $sec.append($methods);
		}
		
		// Properties
		var numProperties = c.numProperties();
		if(numProperties>0){
		    $sec.append($("<h3>Properties</h3>"));
		    var $properties = $("<table></table>").addClass("member_overview");
		    for(var k=0; k<numProperties; k++){
			$properties.append("<tr><td class=\"datatype\">"+(c.getPropertyDataType(k))+"</td><td>" + c.getPropertyName(k) + "</td><td class=\"brief\">"+c.getPropertyBrief(k)+"</td></tr>");
		    }
		    $sec.append($properties);
		}
		contents.push($sec);
		links.push($("<a href=\"#classes-"+c.getName()+"\">"+c.getName()+"</a>"));
	    }
	    createSection("classes","Classes",contents);
	    createMenuList("Classes",links);
	}
	
	// Functions
	/*
	  var $ul = $("<ul></ul>");
	var $details = $("<section id=\"functions\"><h1>Functions</h1></section>");
	for(var j=0; j<functions.length; j++){
	    var args = [];
	    var f = functions[j];
	    
	    $funsec = $("<section></section>");

	    // Construct signature
	    for(var k in f.parameters){
		var p = f.parameters[k];
		args.push("<span class=\"datatype\">"+datatype2link(p.type)+ "</span> " + p.name);
	    }
	    $funsec.append("<h2 id=\""+f.name+"\"><span class=\"datatype\">"+(f.returnvalue ? datatype2link(f.returnvalue.type) : "") + "</span> " + f.name+" ( "+args.join(" , ")+" )</h2>")
		.append("<p>"+f.brief+"</p>");
	    
	    // Parameter details
	    $params = $("<table></table>");
	    for(var k in f.parameters){
		var p = f.parameters[k];
		$params.append("<tr><th><span class=\"datatype\">"+(p.type ? datatype2link(p.type) : "&nbsp;")+ "</span> <span class=\"param\">" + p.name+"</span></th><td>"+p.brief+"</td></tr>");
	    }
	    $funsec.append($params);
	    $details.append($funsec);
	   
	    // For the nav
	    $fun = $("<li><a href=\"#"+f.name+"\">"+f.name+"</a></li>");
	    if(j==0)
		$ul = $("<ul class=\"function_overview\"></ul>");
	    $ul.append($fun);
	}
	if(functions.length){
	    $("nav")
		.append("<h2>Functions</h2>")
		.append($ul);
	    $("article")
		.append($details);
	}
    */	
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

