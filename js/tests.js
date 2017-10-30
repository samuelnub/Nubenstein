/*
 * Fast and easy Quad-Tree implementation written by Barbosik.
 * Useful for quick object search in the area specified with bounds.
 *
 * Copyright (c) 2016 Barbosik
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * 
 * 
 */

function QuadNode(bound, maxChildren, maxLevel, level, parent) {
    if (!level) level = 0;
    if (!parent) parent = null;
    let halfWidth = (bound.maxx - bound.minx) / 2;
    let halfHeight = (bound.maxy - bound.miny) / 2;
    
    this.level = level;
    this.parent = parent;
    this.bound = {
        minx: bound.minx, 
        miny: bound.miny,
        maxx: bound.maxx,
        maxy: bound.maxy,
        halfWidth: halfWidth,
        halfHeight: halfHeight,
        cx: bound.minx + halfWidth,
        cy: bound.miny + halfHeight
    };
    this.maxChildren = maxChildren;
    this.maxLevel = maxLevel;
    this.childNodes = [];
    this.items = [];

    this.insert = function (item) {
        if (item._quadNode != null) {
            throw new TypeError("QuadNode.insert: cannot insert item which already belong to another QuadNode!");
        }
        if (this.childNodes.length != 0) {
            let quad = this.getQuad(item.bound);
            if (quad != -1) {
                this.childNodes[quad].insert(item);
                return;
            }
        }
        this.items.push(item);
        item._quadNode = this;  // attached field, used for quick search quad node by item
        
        // check if rebalance needed
        if (this.childNodes.length != 0 || this.level >= this.maxLevel || this.items.length < this.maxChildren)
            return;
        // split and rebalance current node
        if (this.childNodes.length == 0) {
            // split
            let w = this.bound.halfWidth;
            let h = this.bound.halfHeight;
            let x0 = this.bound.minx + w;
            let y0 = this.bound.miny;
            let x1 = this.bound.minx;
            let y1 = this.bound.miny;
            let x2 = this.bound.minx;
            let y2 = this.bound.miny + h;
            let x3 = this.bound.minx + w;
            let y3 = this.bound.miny + h;
            let b0 = { minx: x0, miny: y0, maxx: x0 + w, maxy: y0 + h };
            let b1 = { minx: x1, miny: y1, maxx: x1 + w, maxy: y1 + h };
            let b2 = { minx: x2, miny: y2, maxx: x2 + w, maxy: y2 + h };
            let b3 = { minx: x3, miny: y3, maxx: x3 + w, maxy: y3 + h };
            this.childNodes.push(new QuadNode(b0, this.maxChildren, this.maxLevel, this.level + 1, this));
            this.childNodes.push(new QuadNode(b1, this.maxChildren, this.maxLevel, this.level + 1, this));
            this.childNodes.push(new QuadNode(b2, this.maxChildren, this.maxLevel, this.level + 1, this));
            this.childNodes.push(new QuadNode(b3, this.maxChildren, this.maxLevel, this.level + 1, this));
        }
        // rebalance
        for (let i = 0; i < this.items.length; ) {
            let qitem = this.items[i];
            let quad = this.getQuad(qitem.bound);
            if (quad != -1) {
                this.items.splice(i, 1);
                qitem._quadNode = null;
                this.childNodes[quad].insert(qitem);
            }
            else i++;
        }
    };

    this.remove = function (item) {
        if (item._quadNode != this) {
            item._quadNode.remove(item);
            return;
        }
        let index = this.items.indexOf(item);
        if (index < 0) {
            throw new TypeError("QuadNode.remove: item not found!");
        }
        this.items.splice(index, 1);
        item._quadNode = null;
        cleanup(this);
    };

    this.cleanup = function(node) {
        if (node.parent==null || node.items.length > 0) return;
        for (let i = 0; i < node.childNodes.length; i++) {
            let child = node.childNodes[i];
            if (child.childNodes.length > 0 || child.items.length > 0)
                return;
        }
        node.childNodes = [];
        cleanup(node.parent);
    };

    this.update = function (item) {
        this.remove(item);
        this.insert(item);
    };

    this.clear = function () {
        for (let i = 0; i < this.items.length; i++)
            this.items[i]._quadNode = null;
        this.items = [];
        for (let i = 0; i < this.childNodes.length; i++)
            this.childNodes[i].clear();
        this.childNodes = [];
    };

    this.contains = function (item) {
        if (item._quadNode == null)
            return false;
        if (item._quadNode != this) {
            return item._quadNode.contains(item);
        }
        return this.items.indexOf(item) >= 0;
    };

    this.find = function (bound, callback) {
        if (this.childNodes.length != 0) {
            let quad = this.getQuad(bound);
            if (quad != -1) {
                this.childNodes[quad].find(bound, callback);
            } else {
                for (let i = 0; i < this.childNodes.length; i++) {
                    let node = this.childNodes[i];
                    if (checkBoundIntersection(node.bound, bound))
                        node.find(bound, callback);
                }
            }
        }
        for (let i = 0; i < this.items.length; i++) {
            let item = this.items[i];
            if (checkBoundIntersection(item.bound, bound))
                callback(item);
        }
    };

    this.any = function (bound, predicate) {
        if (this.childNodes.length != 0) {
            let quad = this.getQuad(bound);
            if (quad != -1) {
                if (this.childNodes[quad].any(bound, predicate))
                    return true;
            } else {
                for (let i = 0; i < this.childNodes.length; i++) {
                    let node = this.childNodes[i];
                    if (checkBoundIntersection(node.bound, bound))
                        if (node.any(bound, predicate))
                            return true;
                }
            }
        }
        for (let i = 0; i < this.items.length; i++) {
            let item = this.items[i];
            if (checkBoundIntersection(item.bound, bound)) {
                if (predicate == null || predicate(item))
                    return true;
            }
        }
        return false;
    };

    this.scanNodeCount = function () {
        let count = 0;
        for (let i = 0; i < this.childNodes.length; i++) {
            count += this.childNodes[i].scanNodeCount();
        }
        return 1 + count;
    };

    this.scanItemCount = function () {
        let count = 0;
        for (let i = 0; i < this.childNodes.length; i++) {
            count += this.childNodes[i].scanItemCount();
        }
        return this.items.length + count;
    };

    this.getQuad = function (bound) {
        let isTop = bound.miny < this.bound.cy && bound.maxy < this.bound.cy;
        let isLeft = bound.minx < this.bound.cx && bound.maxx < this.bound.cx;
        if (isLeft) {
            if (isTop) return 1;
            else if (bound.miny > this.bound.cy) return 2; // isBottom
        }
        else if (bound.minx > this.bound.cx) // isRight
        {
            if (isTop) return 0;
            else if (bound.miny > this.bound.cy) return 3; // isBottom
        }
        return -1;  // cannot fit (too large size)
    };

    function checkBoundIntersection(bound1, bound2) {
        let notIntersect = 
            bound2.minx >= bound1.maxx ||
            bound2.maxx <= bound1.minx ||
            bound2.miny >= bound1.maxy ||
            bound2.maxy <= bound1.miny;
        return !notIntersect;
    };
}