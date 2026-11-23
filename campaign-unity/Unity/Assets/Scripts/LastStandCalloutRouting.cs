using System;
using System.Collections.Generic;
using UnityEngine;

namespace SingedTerra.LastStand
{
    // Screen-space decoration routing. Cards and already placed leaders are
    // obstacles; attachment positions remain the real projected module centers.
    public static class LastStandCalloutRouting
    {
        public static float Distance(Vector2 p,Vector2 a,Vector2 b)
        {var d=b-a;return Vector2.Distance(p,a+d*Mathf.Clamp01(Vector2.Dot(p-a,d)/Mathf.Max(.0001f,d.sqrMagnitude)));}
        static float Cross(Vector2 a,Vector2 b)=>a.x*b.y-a.y*b.x;
        public static bool Crosses(Vector2 a,Vector2 b,Vector2 c,Vector2 d)
        {
            float x=Cross(b-a,c-a),y=Cross(b-a,d-a),u=Cross(d-c,a-c),v=Cross(d-c,b-c);
            return x*y<0 && u*v<0;
        }
        static bool Hits(Vector2 a,Vector2 b,Rect r)
        {
            if(r.Contains(a)||r.Contains(b))return true;
            var lo=r.min;var hi=r.max;var tl=new Vector2(lo.x,hi.y);var br=new Vector2(hi.x,lo.y);
            return Crosses(a,b,lo,tl)||Crosses(a,b,tl,hi)||Crosses(a,b,hi,br)||Crosses(a,b,br,lo);
        }
        static bool Clear(Vector2 a,Vector2 b,IReadOnlyList<Rect> obstacles,IReadOnlyList<Vector2[]> routes,float gap)
        {
            foreach(var r in obstacles)if(Hits(a,b,r))return false;
            foreach(var route in routes)for(int i=1;i<route.Length;i++)
            {
                var c=route[i-1];var d=route[i];
                if(Crosses(a,b,c,d)||Distance(a,c,d)<gap||Distance(b,c,d)<gap||Distance(c,a,b)<gap||Distance(d,a,b)<gap)return false;
            }
            return true;
        }
        static Rect Inflate(Rect r,float gap)=>Rect.MinMaxRect(r.xMin-gap,r.yMin-gap,r.xMax+gap,r.yMax+gap);
        public static Vector2[] Route(Rect card,Vector2 end,Rect viewport,IReadOnlyList<Rect> cards,
            IReadOnlyList<Vector2[]> prior,IReadOnlyList<Vector2> reserved,float scale)
        {
            float gap=10*Mathf.Max(.7f,scale),step=20*Mathf.Max(.7f,scale);
            var obstacles=new List<Rect>();foreach(var r in cards)obstacles.Add(Inflate(r,gap));
            foreach(var p in reserved)if(Vector2.Distance(p,end)>gap*4)obstacles.Add(new Rect(p-Vector2.one*gap*2,Vector2.one*gap*4));
            var ports=new[]{new Vector2(card.xMax,card.center.y),new Vector2(card.xMin,card.center.y),
                new Vector2(card.center.x,card.yMax),new Vector2(card.center.x,card.yMin)};
            var directions=new[]{Vector2.right,Vector2.left,Vector2.up,Vector2.down};
            var order=new List<int>{0,1,2,3};order.Sort((a,b)=>Vector2.Distance(ports[a],end).CompareTo(Vector2.Distance(ports[b],end)));
            foreach(int port in order)
            {
                Vector2 start=ports[port],stub=start+directions[port]*step;
                if(!viewport.Contains(stub))continue;
                // The exit traverses its own margin, but no other card or leader.
                var foreign=new List<Rect>();foreach(var r in cards)if(r!=card)foreign.Add(Inflate(r,gap));
                if(!Clear(start,stub,foreign,prior,gap))continue;
                if(Clear(stub,end,obstacles,prior,gap))return new[]{start,stub,end};
                var path=Search(stub,end,viewport,obstacles,prior,gap,step);
                if(path==null)continue;
                var result=new List<Vector2>{start};result.AddRange(path);return result.ToArray();
            }
            return Array.Empty<Vector2>();
        }
        static List<Vector2> Search(Vector2 start,Vector2 end,Rect bounds,List<Rect> obstacles,IReadOnlyList<Vector2[]> routes,float gap,float step)
        {
            int nx=Mathf.CeilToInt(bounds.width/step)+1,ny=Mathf.CeilToInt(bounds.height/step)+1,count=nx*ny;
            var cost=new float[count];var from=new int[count];var closed=new bool[count];
            for(int i=0;i<count;i++){cost[i]=float.PositiveInfinity;from[i]=-1;}
            int sx=Mathf.RoundToInt((start.x-bounds.xMin)/step),sy=Mathf.RoundToInt((start.y-bounds.yMin)/step),first=sy*nx+sx;
            Func<int,Vector2> point=i=>i==first?start:new Vector2(bounds.xMin+(i%nx)*step,bounds.yMin+(i/nx)*step);
            var open=new List<int>{first};cost[first]=0;int last=-1;
            while(open.Count>0)
            {
                int best=0;float score=float.PositiveInfinity;
                for(int i=0;i<open.Count;i++){int n=open[i];float f=cost[n]+Vector2.Distance(point(n),end);if(f<score){score=f;best=i;}}
                int current=open[best];open.RemoveAt(best);if(closed[current])continue;closed[current]=true;
                Vector2 a=point(current);
                if(Clear(a,end,obstacles,routes,gap)){last=current;break;}
                int cx=current%nx,cy=current/nx;
                for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)
                {
                    if(x==0&&y==0||cx+x<0||cx+x>=nx||cy+y<0||cy+y>=ny)continue;
                    int next=(cy+y)*nx+cx+x;if(closed[next])continue;Vector2 b=point(next);
                    if(!bounds.Contains(b)||!Clear(a,b,obstacles,routes,gap))continue;
                    float value=cost[current]+Vector2.Distance(a,b);
                    if(value>=cost[next])continue;from[next]=current;cost[next]=value;open.Add(next);
                }
            }
            if(last<0)return null;
            var raw=new List<Vector2>{end};for(int at=last;at>=0;at=from[at])raw.Add(point(at));raw.Reverse();
            var result=new List<Vector2>{start};int index=0;
            while(index<raw.Count-1)
            {
                int next=raw.Count-1;while(next>index+1&&!Clear(raw[index],raw[next],obstacles,routes,gap))next--;
                result.Add(raw[next]);index=next;
            }
            return result;
        }
    }
}
