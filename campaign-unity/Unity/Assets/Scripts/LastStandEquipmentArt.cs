using UnityEngine;
using UnityEngine.UI;
namespace SingedTerra.LastStand
{
    internal static class LastStandEquipmentArt
    {
        static Texture2D atlas,metal,panel;
        static Font display,body;
        public static Font Display=>display?display:(display=Resources.Load<Font>("ArtDirection/Display"));
        public static Font Body=>body?body:(body=Resources.Load<Font>("ArtDirection/Body"));
        public static Texture2D Metal=>metal?metal:(metal=Resources.Load<Texture2D>("ArtDirection/WeatheredArmor"));
        public static Texture2D Panel=>panel?panel:(panel=Resources.Load<Texture2D>("ArtDirection/Panel"));
        public static RawImage Icon(string name,Transform parent,int index)
        {
            if(!atlas)atlas=Resources.Load<Texture2D>("ArtDirection/EquipmentAtlas");
            var image=LastStandUiPrimitives.Node(name,parent).gameObject.AddComponent<RawImage>();
            image.texture=atlas;image.raycastTarget=false;Select(image,index);return image;
        }
        public static int Index(LastStandFitting fitting)
        {switch(fitting){case LastStandFitting.Repair:return 1;case LastStandFitting.Launcher:return 2;case LastStandFitting.Scattergun:return 3;case LastStandFitting.Mortar:return 4;case LastStandFitting.Railgun:return 5;case LastStandFitting.Arc:return 6;case LastStandFitting.Shield:return 7;default:return 0;}}
        public static void Select(RawImage image,int index){image.uvRect=new Rect((index%4)*.25f,index<4?.5f:0,.25f,.5f);}
    }
}
